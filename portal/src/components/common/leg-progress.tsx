import { cn } from "@/lib/utils"
import { PointsBv } from "@/components/format/amount"
import { useT } from "@/i18n/use-t"

/**
 * Progression des DEUX JAMBES vers le prochain équilibre, en POINTS (D-053).
 *
 * ═══ POURQUOI C'EST L'ÉLÉMENT CENTRAL DE L'ACCUEIL ═══
 * Deux nombres — « gauche 1 400, droite 600 » — ne disent rien à un affilié. Deux barres et
 * une phrase — « il vous manque 400 points à droite » — disent tout : ce qui bloque, de quel
 * côté, et de combien. C'est ce qui rend le binaire compréhensible, donc motivant. La cliente
 * l'a demandé explicitement, et c'est le seul endroit du portail où un chiffre devient une
 * consigne.
 *
 * ═══ CE QUI EST AFFICHÉ EST LA POOL APPARIABLE, PAS LE CUMUL À VIE ═══
 * Le cumul à vie ne descend jamais et ne dit rien de ce qu'il reste à faire ; la pool, elle,
 * est consommée à chaque équilibre. Montrer le cumul ici ferait croire qu'on approche d'un
 * palier qu'on a déjà franchi dix fois. Le cumul reste affiché à part, comme un historique.
 *
 * ═══ DEUX DIMENSIONS, JAMAIS MÉLANGÉES (D-028) ═══
 * Tout ici est en POINTS, entiers, rendus par `PointsBv`. Aucun dinar n'entre dans ce
 * composant — et aucun ne doit y entrer : l'accueil est un espace RÉSEAU (D-053).
 *
 * ═══ LES COULEURS DES JAMBES SONT LES MÊMES PARTOUT ═══
 * `--leg-left` / `--leg-right` sont partagées par l'accueil, l'arbre et les downlines. Une
 * jambe qui change de couleur d'un écran à l'autre est une jambe qu'on ne reconnaît plus.
 */
interface LegProgressProps {
  /** Points appariables de la jambe gauche (carry-over courant). */
  left: number
  /** Points appariables de la jambe droite. */
  right: number
  /** Palier du pack, en points. `null` tant que le membre n'a pas activé. */
  tier: number | null
  /** Cumul à VIE par jambe — affiché en second plan, jamais confondu avec la pool. */
  lifetimeLeft?: number
  lifetimeRight?: number
  className?: string
}

export function LegProgress({
  left,
  right,
  tier,
  lifetimeLeft,
  lifetimeRight,
  className,
}: LegProgressProps) {
  const t = useT()

  // Sans palier (membre non activé), il n'y a pas de « prochain équilibre » à viser : on
  // montre les points, sans promesse de progression qui n'a pas encore de sens.
  const hasTier = tier !== null && tier > 0

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-3">
        <LegBar
          label={t("legs.left")}
          points={left}
          lifetime={lifetimeLeft}
          tier={hasTier ? tier : null}
          tone="left"
        />
        <LegBar
          label={t("legs.right")}
          points={right}
          lifetime={lifetimeRight}
          tier={hasTier ? tier : null}
          tone="right"
        />
      </div>

      {hasTier && <NextBalanceHint left={left} right={right} tier={tier} />}
    </div>
  )
}

function LegBar({
  label,
  points,
  lifetime,
  tier,
  tone,
}: {
  label: string
  points: number
  lifetime?: number
  tier: number | null
  tone: "left" | "right"
}) {
  const t = useT()
  // Au-delà du palier, la barre est pleine : le surplus n'est pas « perdu », il reste en
  // réserve (les points ne s'évaporent jamais — D-033). Le nombre exact reste lisible à côté.
  const ratio = tier ? Math.min(1, points / tier) : 0

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span
            aria-hidden
            className={cn(
              "size-2.5 rounded-full",
              tone === "left" ? "bg-leg-left" : "bg-leg-right",
            )}
          />
          {label}
        </span>
        <span className="text-sm">
          <PointsBv value={points} />
          {tier !== null && (
            <span className="text-muted-foreground"> / {tier.toLocaleString("fr-FR")}</span>
          )}
        </span>
      </div>

      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={points}
        aria-valuemin={0}
        aria-valuemax={tier ?? undefined}
        aria-label={label}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            tone === "left" ? "bg-leg-left" : "bg-leg-right",
          )}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>

      {lifetime !== undefined && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t("legs.lifetime")} <PointsBv value={lifetime} />
        </p>
      )}
    </div>
  )
}

/**
 * « Il vous manque N points à droite. »
 *
 * L'équilibre se fait sur le MINIMUM des deux jambes : ce qu'il reste à faire est donc
 * l'écart de la jambe la plus FAIBLE au palier — jamais la somme, jamais la moyenne. Dire
 * « il vous manque 400 points » sans préciser le côté serait inexploitable : c'est justement
 * le côté qui indique où placer le prochain filleul.
 */
function NextBalanceHint({
  left,
  right,
  tier,
}: {
  left: number
  right: number
  tier: number
}) {
  const t = useT()

  const weakestIsLeft = left <= right
  const missing = tier - Math.min(left, right)

  if (missing <= 0) {
    return (
      <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-foreground">
        {t("legs.balanceReady")}
      </p>
    )
  }

  return (
    <p className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
      {t("legs.missing")}{" "}
      <strong className="font-semibold">
        <PointsBv value={missing} />
      </strong>{" "}
      {weakestIsLeft ? t("legs.onLeft") : t("legs.onRight")}
    </p>
  )
}
