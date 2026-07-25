import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowRight,
  CalendarClock,
  CreditCard,
  Gift,
  Network,
  Share2,
  Sparkles,
  Trophy,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DataState } from "@/components/common/data-state"
import { Explain, Notice } from "@/components/common/explain"
import { PageHeader } from "@/components/common/page-header"
import { StatCard } from "@/components/common/stat-card"
import { MoneyDt, PointsBv, RewardPoints } from "@/components/format/amount"
import { dashboardQueryOptions } from "@/api/queries/me"
import { useAuth } from "@/auth/use-auth"
import { formatDateTime, formatDt } from "@/lib/format"
import { useT } from "@/i18n/use-t"
import { LegsCard } from "./legs-card"
import { StatusBanner } from "./status-banner"

/**
 * TABLEAU DE BORD (spec §7.1.1) — l'écran qui compte le plus.
 *
 * ORDRE DE LECTURE, décidé et non subi : ce que l'affilié vient voir d'abord (son SOLDE, ses
 * gains), puis ce qui l'explique (le dernier versement, ce qui arrive), puis son réseau, puis
 * les compteurs du moteur. Le solde est le seul chiffre en très grand : c'est la question
 * qu'on se pose en ouvrant l'application.
 *
 * PÉDAGOGIE : chaque chiffre du modèle MLM porte sa phrase. Un affilié n'est pas technicien ;
 * « carry-over » ou « événement inéligible » ne veulent rien dire pour lui. Les explications
 * dépliables (`Explain`) évitent d'écraser l'écran tout en laissant la réponse à un clic.
 *
 * D-028 À L'ÉCRAN : les DINARS passent par `MoneyDt` (3 décimales, unité DT), les POINTS par
 * `PointsBv` (entiers, unité pts), les Points Fidélité par `RewardPoints` (3ᵉ unité). Aucun
 * chiffre de cet écran n'est rendu en texte brut — c'est ce qui rend la confusion impossible.
 */
export function DashboardPage() {
  const t = useT()
  const { member } = useAuth()
  const dashboard = useQuery(dashboardQueryOptions())

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dashboard.title", { name: member?.firstName ?? "" })}
        description={t("dashboard.subtitle")}
      />

      <DataState
        isLoading={dashboard.isPending}
        error={dashboard.error}
        onRetry={() => void dashboard.refetch()}
        rows={4}
      >
        {dashboard.data ? (
          <div className="space-y-6">
            <StatusBanner dashboard={dashboard.data} />

            {/* ── L'argent ── */}
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                tone="highlight"
                label={t("dashboard.balance")}
                hint={t("dashboard.balanceHint")}
                icon={<Wallet className="size-5" />}
                value={<MoneyDt value={dashboard.data.balanceDt} />}
                action={
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link to="/e-cards" />}>
                    {t("ecards.create")}
                    <ArrowRight />
                  </Button>
                }
              />
              <StatCard
                tone="highlight"
                label={t("dashboard.lifetimeEarned")}
                hint={t("dashboard.lifetimeEarnedHint")}
                icon={<Trophy className="size-5" />}
                value={<MoneyDt value={dashboard.data.lifetimeEarnedDt} />}
                action={
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link to="/gains" />}>
                    {t("dashboard.seeCommissions")}
                    <ArrowRight />
                  </Button>
                }
              />
            </div>

            {/* ── Le versement : celui qui vient d'avoir lieu, celui qui arrive ── */}
            <Card>
              <CardHeader>
                <CardTitle>{t("dashboard.lastRun")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {dashboard.data.lastRun ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {t("commissions.week", {
                        date: formatDateTime(dashboard.data.lastRun.periodEnd),
                      })}
                    </p>
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <Figure
                        label={t("dashboard.lastRunGross")}
                        value={<MoneyDt value={dashboard.data.lastRun.grossDt} />}
                      />
                      <Figure
                        label={t("dashboard.lastRunPaid")}
                        value={<MoneyDt value={dashboard.data.lastRun.paidDt} />}
                        strong
                      />
                      <Figure
                        label={t("dashboard.lastRunLost")}
                        value={<MoneyDt value={dashboard.data.lastRun.lostDt} />}
                      />
                    </dl>
                    {/* L'explication du plafond n'apparaît QUE si quelque chose a été perdu :
                        l'afficher à vide apprendrait à l'affilié à ne plus la lire. */}
                    {Number(dashboard.data.lastRun.lostDt) > 0 ? (
                      <Explain titleKey="explain.cap.title" bodyKey="explain.cap.body" />
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("dashboard.lastRunNone")}
                  </p>
                )}

                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-sm font-medium">{t("dashboard.pending")}</p>
                  <p className="mt-1 text-xl font-semibold">
                    <MoneyDt value={dashboard.data.pendingGrossDt} />
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {dashboard.data.pendingEventCount > 0
                      ? t("dashboard.pendingHint", {
                          count: dashboard.data.pendingEventCount,
                        })
                      : t("dashboard.pendingNone")}
                  </p>
                </div>

                <p className="flex items-center gap-2 text-sm">
                  <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="font-medium">{t("dashboard.nextRun")} :</span>
                  <span>{formatDateTime(dashboard.data.nextRunAt)}</span>
                </p>
                <p className="text-xs text-muted-foreground">{t("dashboard.nextRunHint")}</p>
              </CardContent>
            </Card>

            {/* ── L'arbre ── */}
            <LegsCard dashboard={dashboard.data} />

            {/* ── Les compteurs du moteur ── */}
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label={t("dashboard.balancesCount")}
                hint={t("dashboard.balancesCountHint")}
                icon={<Sparkles className="size-4" />}
                value={dashboard.data.lifetimeBalanceCount}
              />
              <StatCard
                label={t("unit.rewardPoints")}
                hint={t("dashboard.rewardPointsHint")}
                icon={<Gift className="size-4" />}
                value={<RewardPoints value={dashboard.data.rewardPoints} />}
              />
              <StatCard
                label={t("dashboard.startupBonus")}
                hint={t("explain.startup.body")}
                icon={<Trophy className="size-4" />}
                value={
                  <span className="text-base font-medium">
                    {t(
                      dashboard.data.startupBonusUsed
                        ? "dashboard.startupBonusUsed"
                        : "dashboard.startupBonusPending",
                    )}
                  </span>
                }
              />
            </div>

            {/* ── Le réseau et les e-cards ── */}
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                label={t("dashboard.downlines")}
                hint={`${dashboard.data.activatedDownlineCount} ${t("dashboard.activatedDownlines")}`}
                icon={<Network className="size-4" />}
                value={dashboard.data.downlineCount}
                action={
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link to="/reseau" />}>
                    {t("nav.network")}
                    <ArrowRight />
                  </Button>
                }
              />
              <StatCard
                label={t("dashboard.referrals")}
                hint={t("explain.sponsorVsUpline.body")}
                icon={<Share2 className="size-4" />}
                value={dashboard.data.referralCount}
                action={
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link to="/parrainer" />}>
                    {t("nav.sponsor")}
                    <ArrowRight />
                  </Button>
                }
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                label={t("dashboard.ecards")}
                hint={t("dashboard.ecardsValue")}
                icon={<CreditCard className="size-4" />}
                value={
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span>{dashboard.data.activeEcardCount}</span>
                    <MoneyDt
                      value={dashboard.data.activeEcardValueDt}
                      className="text-base font-normal text-muted-foreground"
                    />
                  </span>
                }
              />
              <StatCard
                label={t("dashboard.pack")}
                // Le plafond n'est affiché que s'il EXISTE en dinars : un snapshot
                // d'activation antérieur à D-028 n'en porte pas, et écrire « 0,000 DT »
                // annoncerait un plafond nul là où la donnée est simplement absente.
                hint={
                  dashboard.data.weeklyCapDt
                    ? `${t("dashboard.weeklyCap")} : ${formatDt(dashboard.data.weeklyCapDt)} ${t("unit.dt")}`
                    : undefined
                }
                value={
                  <span className="text-base font-medium">
                    {dashboard.data.packName ?? t("dashboard.noPack")}
                  </span>
                }
                action={
                  dashboard.data.tierBv !== null ? (
                    <span className="text-sm text-muted-foreground">
                      {t("activation.packTier")} :{" "}
                      <PointsBv value={dashboard.data.tierBv} />
                    </span>
                  ) : undefined
                }
              />
            </div>

            {/* ── Le rappel qui prévient le plus de malentendus ── */}
            <Notice title={t("explain.twoUnits.title")}>{t("explain.twoUnits.body")}</Notice>
          </div>
        ) : null}
      </DataState>
    </div>
  )
}

function Figure({
  label,
  value,
  strong,
}: {
  label: string
  value: React.ReactNode
  strong?: boolean
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={strong ? "text-lg font-semibold" : "font-medium"}>{value}</dd>
    </div>
  )
}
