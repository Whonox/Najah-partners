import { Link } from "react-router"
import { ArrowRight, UserPlus } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { myDownlinesQueryOptions } from "@/api/queries/network"
import { PointsBv } from "@/components/format/amount"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"
import { cn } from "@/lib/utils"

/** Cinq lignes : de quoi voir « il s'est passé quelque chose » sans transformer l'accueil en liste. */
const RECENT_COUNT = 5

/**
 * ACTIVITÉ RÉCENTE — les derniers arrivés dans mon réseau (D-053).
 *
 * ═══ POURQUOI `newestFirst` EXISTE ═══
 * La liste des downlines est triée par parcours d'arbre (profondeur, puis id). « Qui vient de
 * me rejoindre » ne s'y lit pas : les derniers inscrits sont les plus profonds, donc en
 * dernière page. Le tri par arrivée a été ajouté au contrat pour cet écran (T9.5).
 *
 * ═══ CE QUI EST MONTRÉ, ET CE QUI NE L'EST PAS ═══
 * Nom, position, points APPORTÉS. Ni e-mail, ni téléphone, ni solde : voir quelqu'un dans son
 * sous-arbre ne donne aucun droit sur ses coordonnées (le contrat ne les porte d'ailleurs
 * pas). Les points apportés valent `—` et non `0` pour un membre non activé — il n'a rien
 * injecté (D-005), ce qui n'est pas la même chose qu'avoir injecté zéro.
 */
export function RecentActivity() {
  const t = useT()
  const recent = useQuery(
    myDownlinesQueryOptions({ page: 1, pageSize: RECENT_COUNT, newestFirst: true }),
  )

  const items = recent.data?.items ?? []

  return (
    <section className="rounded-2xl bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{t("home.recent.title")}</h2>
        <Link
          to="/reseau"
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm text-link underline-offset-4 hover:underline"
        >
          {t("home.recent.all")}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      {recent.isPending ? (
        <p className="text-sm text-muted-foreground">{t("state.loading")}</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted">
            <UserPlus className="size-5 text-muted-foreground" aria-hidden />
          </span>
          <p className="text-sm text-muted-foreground">{t("home.recent.empty")}</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted"
            >
              {/* Initiales plutôt qu'une icône générique : cinq lignes identiques ne se
                  distinguent pas au premier coup d'œil, cinq monogrammes si. */}
              <span
                aria-hidden
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-background",
                  row.rootLeg === "LEFT" ? "bg-leg-left" : "bg-leg-right",
                )}
              >
                {row.firstName.charAt(0)}
                {row.lastName.charAt(0)}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {row.firstName} {row.lastName}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {row.rootLeg === "LEFT" ? t("legs.left") : t("legs.right")}
                  {row.activatedAt ? ` · ${formatDateTime(row.activatedAt)}` : ""}
                </span>
              </span>

              <span className="shrink-0 text-end text-sm">
                <PointsBv value={row.contributedPoints} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
