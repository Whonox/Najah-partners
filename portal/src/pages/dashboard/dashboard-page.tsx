import type { ReactNode } from "react"
import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Sparkles, Trophy } from "lucide-react"
import { networkQueryOptions, profileQueryOptions } from "@/api/queries/me"
import { DataState } from "@/components/common/data-state"
import { Explain } from "@/components/common/explain"
import { LegProgress } from "@/components/common/leg-progress"
import { RewardPoints } from "@/components/format/amount"
import { useT } from "@/i18n/use-t"
import { MemberHeader } from "./member-header"
import { QuickActions } from "./quick-actions"
import { RecentActivity } from "./recent-activity"
import { StatusBanner } from "./status-banner"

/**
 * ACCUEIL DU PORTAIL — un ESPACE RÉSEAU, pas un tableau de bord (D-053).
 *
 * ═══ AUCUNE INFORMATION MONÉTAIRE, ET CE N'EST PAS UNE CONSIGNE D'ÉCRAN ═══
 * La route qui alimente cette page ne PORTE aucun montant : `MemberNetworkDto` ne déclare
 * aucun champ `…Dt`, donc en afficher un depuis ici ne compilerait pas. Le solde, les gains
 * et le dernier versement vivent dans « Mes gains » et « Mes e-cards », derrière la seconde
 * authentification. Il n'y a donc rien à surveiller ici — l'invariant est porté par le contrat.
 *
 * ═══ LA PROGRESSION DES DEUX JAMBES EST LA PIÈCE CENTRALE ═══
 * Elle occupe la place et la surface qui le disent : juste sous l'en-tête personnel, seule sur
 * sa ligne, avec « il vous manque N points à droite » en évidence. Ce n'est pas une carte
 * parmi d'autres, et c'est délibéré — c'est CE bloc qui rend le binaire compréhensible à
 * quelqu'un qui ne connaît pas le modèle. Deux nombres bruts ne l'auraient pas fait.
 *
 * ═══ CE QUI ÉLOIGNE CET ÉCRAN DU BACK-OFFICE ═══
 * Pas de grille de cartes plates, pas de filets, pas de tableaux. Des surfaces posées sur le
 * fond (`bg-card`, sans bordure), des rayons larges, des respirations généreuses, et une
 * hiérarchie franche : la personne, ce qui demande une action, sa progression, ses raccourcis,
 * son réseau. Le back-office est un outil de saisie ; ceci est un endroit où l'on vient voir
 * où l'on en est.
 */
export function DashboardPage() {
  const t = useT()
  const profile = useQuery(profileQueryOptions())
  const network = useQuery(networkQueryOptions())

  return (
    <DataState
      isLoading={profile.isPending || network.isPending}
      error={profile.error ?? network.error}
      onRetry={() => {
        void profile.refetch()
        void network.refetch()
      }}
      isEmpty={!profile.data || !network.data}
    >
      {profile.data && network.data && (
        <div className="space-y-5">
          <MemberHeader
            profile={profile.data}
            packName={network.data.packName ?? null}
            status={network.data.status}
          />

          {/* Ce qui demande une ACTION passe avant tout le reste : un compte gelé ou une
              échéance proche ne se découvre pas en bas de page. */}
          <StatusBanner network={network.data} />

          {/* ═══ LA PIÈCE CENTRALE ═══ */}
          <section className="rounded-2xl bg-card p-5 sm:p-7">
            <div className="mb-5">
              <h2 className="text-lg font-semibold">{t("home.legs.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("home.legs.subtitle")}</p>
            </div>

            <LegProgress
              left={network.data.carriedLeftPoints}
              right={network.data.carriedRightPoints}
              tier={network.data.tierBv ?? null}
              missing={network.data.pointsToNextBalance ?? null}
              weakestLeg={network.data.weakestLeg ?? null}
              lifetimeLeft={network.data.leftPoints}
              lifetimeRight={network.data.rightPoints}
            />

            <div className="mt-5 space-y-1 border-t pt-4">
              <Explain titleKey="explain.balance.title" bodyKey="explain.balance.body" />
              <Explain titleKey="explain.carry.title" bodyKey="explain.carry.body" />
            </div>
          </section>

          <QuickActions />

          {/* Le RÉSEAU en trois nombres, et rien de plus : des repères, pas un rapport. Le
              détail vit dans « Mon réseau ». */}
          <section className="rounded-2xl bg-card p-5 sm:p-6">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold">{t("home.network.title")}</h2>
              <Link
                to="/reseau"
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm text-link underline-offset-4 hover:underline"
              >
                {t("home.network.all")}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>

            <dl className="grid grid-cols-3 gap-3 text-center">
              <NetworkFigure
                label={t("home.network.downlines")}
                value={network.data.downlineCount}
              />
              <NetworkFigure
                label={t("home.network.activated")}
                value={network.data.activatedDownlineCount}
              />
              <NetworkFigure
                label={t("home.network.referrals")}
                value={network.data.referralCount}
              />
            </dl>

            {/* Compteurs du moteur : des JALONS et des POINTS FIDÉLITÉ, jamais de l'argent —
                ils ont donc toute leur place sur cet écran (D-053, D-032). */}
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
              {/* Un NOMBRE d'équilibres, pas des points : surtout pas `PointsBv`, qui
                  collerait l'unité « pts » derrière « 155 » et ferait croire à 155 points.
                  Les compteurs du moteur ne sont ni des points, ni des dinars (D-028). */}
              <Milestone
                icon={<Trophy className="size-4 text-primary" aria-hidden />}
                label={t("home.milestones.balances")}
                value={
                  <span className="tabular-nums">{network.data.lifetimeBalanceCount}</span>
                }
              />
              {network.data.rewardPoints > 0 && (
                <Milestone
                  icon={<Sparkles className="size-4 text-primary" aria-hidden />}
                  label={t("home.milestones.rewardPoints")}
                  value={<RewardPoints value={network.data.rewardPoints} />}
                />
              )}
            </div>
          </section>

          <RecentActivity />
        </div>
      )}
    </DataState>
  )
}

function NetworkFigure({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted/60 px-2 py-4">
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      <dt className="mt-0.5 text-xs leading-tight text-muted-foreground">{label}</dt>
    </div>
  )
}

function Milestone({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1.5 text-sm">
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  )
}
