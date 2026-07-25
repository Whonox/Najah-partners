import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Check, PartyPopper } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DataState } from "@/components/common/data-state"
import { EcardPayment } from "@/components/common/ecard-payment"
import { Explain, Notice } from "@/components/common/explain"
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
import { fromMillimes, toMillimes } from "@/lib/money"
import { useT } from "@/i18n/use-t"
import { cartTotals, type Cart } from "./cart"
import { ProductPicker } from "./product-picker"

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
 * contre-intuitif pour un nouvel affilié — d'où un écran qui affiche EN PERMANENCE combien de
 * points il lui reste à atteindre, et le montant exact à couvrir, au lieu de le lui apprendre
 * par un refus.
 *
 * Le front ne calcule aucune règle : il additionne des valeurs affichées pour guider. Les deux
 * contrôles qui font foi sont côté backend, sous verrou, contre le SNAPSHOT d'activation.
 */
export function ActivationFlow({ profile }: { profile: MemberProfile }) {
  const t = useT()
  const { refreshProfile } = useAuth()
  const packs = useQuery(packsQueryOptions())
  const products = useQuery(productsQueryOptions())
  const checkout = useActivationCheckout()

  const [pack, setPack] = useState<PackOffer | null>(null)
  const [cart, setCart] = useState<Cart>({})
  const [codes, setCodes] = useState<string[]>([])
  const [address, setAddress] = useState("")
  const [done, setDone] = useState(false)

  const totals = cartTotals(products.data ?? [], cart)
  const remaining = pack ? pack.tierBv - totals.totalPoints : 0
  const tierExact = pack !== null && remaining === 0

  // Montant dû = prix du pack − acompte figé SUR LE MEMBRE (jamais le paramètre courant).
  const dueMillimes = pack
    ? toMillimes(pack.priceDt) - toMillimes(profile.registrationPaidDt)
    : 0
  const dueDt = fromMillimes(dueMillimes)

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
      setDone(true)
      toast.success(t("activation.success"))
    } catch (cause) {
      toast.error(errorMessage(cause))
    }
  }

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <PartyPopper className="size-10 text-link" aria-hidden />
          <h2 className="text-xl font-semibold">{t("activation.success")}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("activation.successBody")}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── 1. Le pack ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("activation.choosePack")}</CardTitle>
        </CardHeader>
        <CardContent>
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
                      setPack(offer)
                      // Changer de pack change le palier visé : garder un panier composé pour
                      // l'ancien laisserait un total faux à l'écran sans que rien ne le dise.
                      setCart({})
                    }}
                  />
                </li>
              ))}
            </ul>
          </DataState>
        </CardContent>
      </Card>

      {pack ? (
        <>
          {/* ── 2. Le panier, au palier EXACT ── */}
          <Card>
            <CardHeader>
              <CardTitle>{t("activation.composeCart")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Notice>{t("activation.pointsRule")}</Notice>

              {/* LE GUIDE PERMANENT : il est collant en haut du bloc, parce que la liste de
                  produits est longue et qu'un compteur qu'il faut remonter chercher ne guide
                  personne. */}
              <div
                className={
                  tierExact
                    ? "sticky top-16 z-10 rounded-lg border border-success/40 bg-success/10 p-3"
                    : "sticky top-16 z-10 rounded-lg border border-highlight-border bg-highlight p-3"
                }
              >
                <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{t("activation.pointsProgress")}</span>
                  <span className="text-base font-semibold">
                    <PointsBv value={totals.totalPoints} /> / <PointsBv value={pack.tierBv} />
                  </span>
                </p>
                <p className="mt-1 text-sm">
                  {tierExact
                    ? t("activation.pointsExact")
                    : remaining > 0
                      ? t("activation.pointsRemaining", { count: remaining })
                      : t("activation.pointsExceeded", { count: -remaining })}
                </p>
              </div>

              <DataState
                isLoading={products.isPending}
                error={products.error}
                isEmpty={products.data?.length === 0}
                emptyMessage={t("shop.empty")}
                onRetry={() => void products.refetch()}
              >
                <ProductPicker
                  products={products.data ?? []}
                  cart={cart}
                  onChange={setCart}
                />
              </DataState>
            </CardContent>
          </Card>

          {/* ── 3. Le paiement ── */}
          <Card>
            <CardHeader>
              <CardTitle>{t("activation.pay")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-highlight-border bg-highlight p-3">
                <p className="text-sm font-medium">{t("activation.dueTitle")}</p>
                <p className="mt-1 text-2xl font-semibold">
                  <MoneyDt value={dueDt} />
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("activation.dueBreakdown", {
                    price: `${pack.priceDt} ${t("unit.dt")}`,
                    deposit: `${profile.registrationPaidDt} ${t("unit.dt")}`,
                  })}
                </p>
              </div>

              <Explain
                titleKey="explain.twoUnits.title"
                bodyKey="explain.twoUnits.body"
              />
              <Notice>{t("activation.depositExplain")}</Notice>

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

              {checkout.error ? (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage(checkout.error)}</AlertDescription>
                </Alert>
              ) : null}

              <Button
                className="w-full"
                disabled={!tierExact || codes.length === 0 || checkout.isPending}
                onClick={() => void submit()}
              >
                {checkout.isPending ? t("shop.checkingOut") : t("shop.checkout")}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {t("payment.noGateway")}
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

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
      className={
        selected
          ? "flex h-full flex-col gap-3 rounded-xl border-2 border-primary bg-highlight p-4"
          : "flex h-full flex-col gap-3 rounded-xl border bg-card p-4"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{offer.name}</h3>
        {selected ? <Check className="size-5 text-primary" aria-hidden /> : null}
      </div>

      <dl className="space-y-1.5 text-sm">
        <Line label={t("activation.packTier")} value={<PointsBv value={offer.tierBv} />} />
        <Line label={t("activation.packPrice")} value={<MoneyDt value={offer.priceDt} />} />
        <Line
          label={t("activation.dueTitle")}
          value={<MoneyDt value={dueDt} className="font-semibold" />}
        />
        <Line
          label={t("activation.packDirect")}
          value={<MoneyDt value={offer.directCommissionDt} />}
        />
        <Line
          label={t("activation.packIndirect")}
          value={<MoneyDt value={offer.indirectCommissionDt} />}
        />
        <Line
          label={t("activation.packCap")}
          value={<MoneyDt value={offer.weeklyCapDt} />}
        />
      </dl>

      <Button
        variant={selected ? "secondary" : "default"}
        className="mt-auto"
        onClick={onSelect}
      >
        {t(selected ? "activation.selectedPack" : "activation.selectPack")}
      </Button>
    </div>
  )
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
