import { useState } from "react"
import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowRight, Check, PartyPopper, Sparkles } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DataState } from "@/components/common/data-state"
import { EcardPayment } from "@/components/common/ecard-payment"
import { Explain, Notice } from "@/components/common/explain"
import { PageHeader } from "@/components/common/page-header"
import { Stepper } from "@/components/common/stepper"
import { useStepper } from "@/components/common/use-stepper"
import { MoneyDt, PointsBv } from "@/components/format/amount"
import { errorMessage } from "@/api/error"
import {
  packsQueryOptions,
  productsQueryOptions,
  useActivationCheckout,
  type PackOffer,
} from "@/api/queries/shop"
import type { MemberProfile } from "@/api/queries/me"
import { useAuth } from "@/auth/use-auth"
import { formatDt, formatPoints } from "@/lib/format"
import { fromMillimes, toMillimes } from "@/lib/money"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/use-t"
import { cartTotals, type Cart } from "./cart"
import { CartPanel } from "./cart-panel"
import { CatalogGrid } from "./catalog-grid"

/**
 * ACTIVATION (spec §7.1.4a) — le parcours le plus exigeant du portail, et celui où un affilié
 * se perd le plus facilement. Il doit satisfaire DEUX contraintes qui n'ont rien à voir l'une
 * avec l'autre :
 *
 *  1. son panier doit totaliser EXACTEMENT le palier du pack, EN POINTS (D-006) ;
 *  2. ses e-cards doivent couvrir EXACTEMENT le prix du pack MOINS l'acompte de 100 DT déjà
 *     versé à l'inscription, EN DINARS (D-029 + D-037).
 *
 * Rien ne relie ces deux nombres : le prix payé ne dépend pas des produits choisis, et les
 * points du panier ne dépendent pas de ce qu'il coûte. C'est le point du modèle le plus
 * contre-intuitif pour un nouvel affilié.
 *
 * ═══ POURQUOI UN PARCOURS EN ÉTAPES, ET NON UNE PAGE ═══
 * La T9 empilait les trois blocs sur un seul écran. On y voyait donc en même temps un palier
 * en POINTS et un montant en DINARS, deux compteurs qui ne se répondent pas, sans jamais
 * savoir lequel bloquait. Les étapes séparent les deux contraintes DANS LE TEMPS : on compose
 * en points, puis on paie en dinars. Une seule question à la fois, et le fil dit combien il en
 * reste — ce qui, sur un parcours qui engage 2 100 DT, vaut mieux qu'un défilement.
 *
 * ═══ CE QUE LE FRONT NE FAIT PAS ═══
 * Il ne calcule aucune règle : il additionne des valeurs affichées pour guider. Les deux
 * contrôles qui font foi sont côté backend, sous verrou, contre le SNAPSHOT d'activation.
 */
const STEPS = ["pack", "cart", "payment", "done"] as const

export function ActivationFlow({ profile }: { profile: MemberProfile }) {
  const t = useT()
  const { refreshProfile } = useAuth()
  const packs = useQuery(packsQueryOptions())
  const products = useQuery(productsQueryOptions())
  const checkout = useActivationCheckout()
  const stepper = useStepper(STEPS.length)

  const [pack, setPack] = useState<PackOffer | null>(null)
  const [cart, setCart] = useState<Cart>({})
  const [codes, setCodes] = useState<string[]>([])
  const [address, setAddress] = useState("")

  const totals = cartTotals(products.data ?? [], cart)
  const remaining = pack ? pack.tierBv - totals.totalPoints : 0
  const tierExact = pack !== null && remaining === 0

  // Montant dû = prix du pack − acompte figé SUR LE MEMBRE (jamais le paramètre courant).
  const dueMillimes = pack
    ? toMillimes(pack.priceDt) - toMillimes(profile.registrationPaidDt)
    : 0
  const dueDt = fromMillimes(dueMillimes)

  const step = STEPS[stepper.current]

  async function submit() {
    if (!pack) return
    try {
      await checkout.mutateAsync({
        packId: pack.id,
        items: totals.lines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
        ecardCodes: codes,
        shippingAddress: address.trim() === "" ? undefined : address.trim(),
      })
      await refreshProfile()
      stepper.goTo(STEPS.indexOf("done"))
      toast.success(t("activation.success"))
    } catch (cause) {
      toast.error(errorMessage(cause))
    }
  }

  const done = step === "done"

  return (
    <div className="space-y-5">
      {/* Sur la confirmation, plus d'en-tête : « choisissez un pack, composez votre panier »
          au-dessus d'un compte déjà activé se lirait comme s'il restait quelque chose à faire. */}
      {!done && (
        <PageHeader title={t("activation.title")} description={t("activation.subtitle")} />
      )}

      {/* Le fil reste sur la confirmation, et c'est là qu'il sert le plus : les quatre
          pastilles cochées referment le parcours. Le retour en arrière, lui, disparaît —
          l'activation est faite, rejouer une étape ne mènerait nulle part. */}
      <Stepper
        current={stepper.current}
        steps={[
          { label: t("activation.step.pack") },
          { label: t("activation.step.cart") },
          { label: t("activation.step.payment") },
          { label: t("activation.step.done") },
        ]}
        // Retour possible vers une étape DÉJÀ franchie seulement : on ne saute pas la
        // composition du panier pour aller payer.
        onStepClick={done ? undefined : (index) => stepper.goTo(index)}
      />

      {done && <ActivationDone />}

      {step === "pack" && (
        <section className="space-y-4">
          <StepIntro
            title={t("activation.choosePack")}
            body={t("activation.choosePackHint")}
          />

          <DataState
            isLoading={packs.isPending}
            error={packs.error}
            onRetry={() => void packs.refetch()}
            rows={2}
          >
            <ul className="grid gap-3 sm:grid-cols-2">
              {(packs.data ?? []).map((offer) => (
                <li key={offer.id}>
                  <PackCard
                    offer={offer}
                    depositDt={profile.registrationPaidDt}
                    selected={pack?.id === offer.id}
                    onSelect={() => {
                      // Changer de pack change le palier visé : garder un panier composé pour
                      // l'ancien laisserait un total faux à l'écran sans que rien ne le dise.
                      if (pack?.id !== offer.id) setCart({})
                      setPack(offer)
                      stepper.next()
                    }}
                  />
                </li>
              ))}
            </ul>
          </DataState>
        </section>
      )}

      {step === "cart" && pack && (
        <section className="space-y-4">
          <StepIntro
            title={t("activation.composeCart")}
            body={t("activation.composeCartHint", { pack: pack.name })}
          />

          {/* LE GUIDE PERMANENT. C'est la seule information qui doit rester sous les yeux
              pendant toute la composition : sans elle, on ajoute des produits en espérant
              tomber juste. Elle est en POINTS, jamais en dinars. */}
          <CartPanel
            lines={totals.lines}
            tone={tierExact ? "success" : "default"}
            onQuantityChange={(productId, quantity) =>
              setCart((current) => {
                const next = { ...current }
                if (quantity <= 0) delete next[productId]
                else next[productId] = quantity
                return next
              })
            }
            onClear={() => setCart({})}
            summary={
              <>
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">{t("activation.pointsProgress")}</span>
                  <span className="font-semibold tabular-nums">
                    <PointsBv value={totals.totalPoints} /> / <PointsBv value={pack.tierBv} />
                  </span>
                </p>
                <p
                  className={
                    tierExact
                      ? "mt-0.5 text-xs font-medium text-success"
                      : "mt-0.5 text-xs text-muted-foreground"
                  }
                >
                  {tierExact
                    ? t("activation.pointsExact")
                    : remaining > 0
                      ? t("activation.pointsRemaining", { count: formatPoints(remaining) })
                      : t("activation.pointsExceeded", { count: formatPoints(-remaining) })}
                </p>
              </>
            }
            detail={
              <dl className="space-y-1.5 text-sm">
                <Row
                  label={t("shop.cartPoints")}
                  value={<PointsBv value={totals.totalPoints} />}
                />
                <Row
                  label={t("activation.packTier")}
                  value={<PointsBv value={pack.tierBv} />}
                />
              </dl>
            }
            footer={
              <Button
                className="w-full"
                disabled={!tierExact}
                onClick={() => stepper.next()}
              >
                {t("activation.toPayment")}
                <ArrowRight />
              </Button>
            }
          />

          <Notice>{t("activation.pointsRule")}</Notice>

          <CatalogGrid cart={cart} onChange={setCart} />

          {/* Le même passage à l'étape suivante, EN BAS de la grille : au terme d'un long
              défilement, remonter chercher le bouton dans le panneau serait absurde. */}
          <Button
            className="w-full"
            size="lg"
            disabled={!tierExact}
            onClick={() => stepper.next()}
          >
            {tierExact
              ? t("activation.toPayment")
              : remaining > 0
                ? t("activation.pointsRemaining", { count: formatPoints(remaining) })
                : t("activation.pointsExceeded", { count: formatPoints(-remaining) })}
            {tierExact && <ArrowRight />}
          </Button>
        </section>
      )}

      {step === "payment" && pack && (
        <section className="space-y-4">
          <StepIntro title={t("activation.pay")} body={t("activation.payHint")} />

          {/* Le montant dû et le panier composé, côte à côte : ce sont les deux dimensions du
              parcours (D-028), et c'est le dernier écran où l'on peut encore les vérifier. */}
          <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
            <p className="text-sm text-muted-foreground">{t("activation.dueTitle")}</p>
            <p className="mt-1 text-3xl font-semibold">
              <MoneyDt value={dueDt} />
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("activation.dueBreakdown", {
                price: `${formatDt(pack.priceDt)} ${t("unit.dt")}`,
                deposit: `${formatDt(profile.registrationPaidDt)} ${t("unit.dt")}`,
              })}
            </p>

            <dl className="mt-4 space-y-1.5 border-t pt-4 text-sm">
              <Row label={t("activation.packTier")} value={<span>{pack.name}</span>} />
              <Row
                label={t("shop.cartPoints")}
                value={<PointsBv value={totals.totalPoints} />}
              />
              <Row
                label={t("shop.cartItems")}
                value={
                  <span className="tabular-nums">
                    {totals.lines.reduce((n, line) => n + line.quantity, 0)}
                  </span>
                }
              />
            </dl>

            <Button
              variant="ghost"
              size="sm"
              className="mt-2 -ms-2"
              onClick={() => stepper.goTo(STEPS.indexOf("cart"))}
            >
              {t("activation.editCart")}
            </Button>
          </div>

          <Explain titleKey="explain.twoUnits.title" bodyKey="explain.twoUnits.body" />
          <Notice>{t("activation.depositExplain")}</Notice>

          <div className="space-y-4 rounded-2xl bg-card p-5 ring-1 ring-border">
            <EcardPayment
              dueDt={dueDt}
              codes={codes}
              onChange={setCodes}
              disabled={checkout.isPending}
            />

            <div className="space-y-1.5">
              <Label htmlFor="activation-address">{t("shop.shipping")}</Label>
              <Input
                id="activation-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("shop.shippingOptional")}</p>
            </div>

            <Notice>{t("shop.shippingOutside")}</Notice>

            {checkout.error && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage(checkout.error)}</AlertDescription>
              </Alert>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={!tierExact || codes.length === 0 || checkout.isPending}
              onClick={() => void submit()}
            >
              {checkout.isPending ? t("shop.checkingOut") : t("shop.checkout")}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {t("payment.noGateway")}
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

function StepIntro({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  )
}

/**
 * Confirmation. Un compte qui vient d'être activé n'a rien de plus à faire ICI : ce qui a
 * changé est dans son arbre et sur son accueil, où les points du palier viennent d'arriver.
 * L'écran y renvoie plutôt que de laisser l'affilié sur une boutique dont le parcours n'a plus
 * d'objet.
 */
function ActivationDone() {
  const t = useT()
  return (
    <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
      <PartyPopper className="mx-auto size-12 text-primary" aria-hidden />
      <h2 className="mt-4 text-xl font-semibold">{t("activation.success")}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {t("activation.successBody")}
      </p>
      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        <Button nativeButton={false} render={<Link to="/" />}>
          {t("activation.toDashboard")}
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link to="/reseau" />}>
          {t("activation.toNetwork")}
        </Button>
      </div>
    </div>
  )
}

/**
 * Une offre de pack. Le chiffre mis en avant est le MONTANT À RÉGLER (prix − acompte), pas le
 * prix : c'est celui que l'affilié devra couvrir en e-cards, et afficher le prix en gros
 * ferait chercher 2 200 DT de cartes pour un dû de 2 100.
 */
function PackCard({
  offer,
  depositDt,
  selected,
  onSelect,
}: {
  offer: PackOffer
  depositDt: string
  selected: boolean
  onSelect: () => void
}) {
  const t = useT()
  const dueDt = fromMillimes(toMillimes(offer.priceDt) - toMillimes(depositDt))

  return (
    <div
      className={cn(
        "flex h-full flex-col gap-3 rounded-2xl bg-card p-4",
        selected ? "ring-2 ring-primary" : "ring-1 ring-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{offer.name}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <PointsBv value={offer.tierBv} />
          </p>
        </div>
        {selected && <Check className="size-5 shrink-0 text-primary" aria-hidden />}
      </div>

      <div className="rounded-xl bg-muted/60 p-3">
        <p className="text-xs text-muted-foreground">{t("activation.dueTitle")}</p>
        <p className="mt-0.5 text-2xl font-semibold">
          <MoneyDt value={dueDt} />
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("activation.dueBreakdown", {
            price: `${formatDt(offer.priceDt)} ${t("unit.dt")}`,
            deposit: `${formatDt(depositDt)} ${t("unit.dt")}`,
          })}
        </p>
      </div>

      <dl className="space-y-1.5 text-sm">
        <Row
          label={t("activation.packDirect")}
          value={<MoneyDt value={offer.directCommissionDt} />}
        />
        <Row
          label={t("activation.packIndirect")}
          value={<MoneyDt value={offer.indirectCommissionDt} />}
        />
        <Row
          label={t("activation.packCap")}
          value={<MoneyDt value={offer.weeklyCapDt} />}
        />
      </dl>

      <Button className="mt-auto" onClick={onSelect}>
        <Sparkles />
        {t(selected ? "activation.selectedPack" : "activation.selectPack")}
      </Button>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
