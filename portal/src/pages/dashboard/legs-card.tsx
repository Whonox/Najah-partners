import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PointsBv } from "@/components/format/amount"
import { Explain } from "@/components/common/explain"
import { useT } from "@/i18n/use-t"
import type { MemberDashboard } from "@/api/queries/me"

/**
 * MES DEUX JAMBES — le cœur du modèle binaire, montré tel qu'il fonctionne.
 *
 * Deux colonnes strictement symétriques, aux couleurs de jambe du thème (`--leg-left` /
 * `--leg-right`) : ce sont les MÊMES couleurs que dans l'arbre et la liste des downlines, de
 * sorte qu'« à gauche » veuille dire la même chose sur les trois écrans.
 *
 * DEUX CHIFFRES PAR JAMBE, et ne pas les confondre est tout l'enjeu :
 *  — le cumul À VIE : tout ce que la jambe a reçu depuis toujours, jamais décrémenté ;
 *  — la RÉSERVE (carry-over) : ce qui n'a pas encore trouvé son pendant de l'autre côté.
 * Le second est plus petit que le premier dès qu'un équilibre a eu lieu, et un affilié qui ne
 * comprend pas pourquoi croit à une perte. D'où l'explication, dépliable, juste en dessous.
 *
 * Aucune barre de progression ici : « à quelle distance suis-je du prochain équilibre » se
 * calcule (palier moins la plus petite réserve) et le calcul appartient au backend. Afficher
 * une jauge que le front aurait déduite serait précisément la règle métier côté front qu'on
 * s'interdit — et elle mentirait le jour où le moteur changerait.
 */
export function LegsCard({ dashboard }: { dashboard: MemberDashboard }) {
  const t = useT()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.legs")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <LegColumn
            side="left"
            label={t("dashboard.legLeft")}
            total={dashboard.leftPoints}
            carried={dashboard.carriedLeftPoints}
          />
          <LegColumn
            side="right"
            label={t("dashboard.legRight")}
            total={dashboard.rightPoints}
            carried={dashboard.carriedRightPoints}
          />
        </div>

        {dashboard.tierBv !== null ? (
          <p className="text-sm text-muted-foreground">
            {t("dashboard.tier")} :{" "}
            <PointsBv value={dashboard.tierBv} className="font-medium text-foreground" /> —{" "}
            {t("dashboard.tierHint")}
          </p>
        ) : null}

        <Explain titleKey="explain.balance.title" bodyKey="explain.balance.body" />
        <Explain titleKey="explain.carry.title" bodyKey="explain.carry.body" />
      </CardContent>
    </Card>
  )
}

function LegColumn({
  side,
  label,
  total,
  carried,
}: {
  side: "left" | "right"
  label: string
  total: number
  carried: number
}) {
  const t = useT()

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "size-2.5 rounded-full",
            side === "left" ? "bg-leg-left" : "bg-leg-right",
          )}
        />
        <span className="text-sm font-medium">{label}</span>
      </div>

      <dl className="mt-3 space-y-2.5">
        <div>
          <dt className="text-xs text-muted-foreground">{t("dashboard.legsTotal")}</dt>
          <dd className="text-lg font-semibold">
            <PointsBv value={total} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("dashboard.carry")}</dt>
          <dd className="font-medium">
            <PointsBv value={carried} />
          </dd>
        </div>
      </dl>
    </div>
  )
}
