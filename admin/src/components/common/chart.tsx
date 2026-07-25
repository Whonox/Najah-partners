import { useId } from "react"
import { cn } from "@/lib/utils"

/**
 * Deux graphes, faits MAISON en SVG — comme la généalogie (T8b), et pour les mêmes raisons :
 * deux séries d'une seule variable ne justifient pas une bibliothèque de graphes (~100 ko), qui
 * en plus ne lit pas le thème et exigerait qu'on lui passe des couleurs à la main — donc des
 * couleurs en dur dans un composant, ce que `admin/CLAUDE.md` interdit. Ici, tout vient des
 * variables sémantiques : le mode sombre suit sans une ligne de code de plus.
 *
 * CHOIX DE FORME (ils ne sont pas interchangeables) :
 *  — **barres verticales** pour les activations par jour : on compare des grandeurs
 *    indépendantes, jour par jour. Une courbe suggérerait une continuité entre deux jours qui
 *    n'existe pas ;
 *  — **courbe + aire** pour la croissance du réseau : c'est un cumul, une grandeur qui ne
 *    redescend jamais. Des barres cumulées feraient croire à des mesures indépendantes.
 *
 * UNE SEULE SÉRIE PAR GRAPHE, donc pas de légende (le titre nomme la série) et pas de palette
 * catégorielle à valider : la couleur est l'accent du thème, dont les contrastes clair/sombre
 * sont déjà mesurés (D-044). Aucun axe secondaire nulle part — deux mesures d'échelles
 * différentes font deux graphes, jamais deux échelles sur un même dessin.
 *
 * ACCESSIBILITÉ : chaque graphe est doublé d'un TABLEAU lisible par lecteur d'écran (masqué
 * visuellement). Un graphe qui n'existe qu'en pixels n'est pas une donnée consultable.
 */

export interface ChartPoint {
  /** Étiquette de l'abscisse (jour), déjà formatée pour l'affichage. */
  label: string
  value: number
}

const VIEWBOX_WIDTH = 720
const VIEWBOX_HEIGHT = 180
/** Marge basse : la place des étiquettes d'abscisse. */
const AXIS_HEIGHT = 22
const PLOT_HEIGHT = VIEWBOX_HEIGHT - AXIS_HEIGHT
/** Rayon des extrémités de données (spec de marque : 4px, ancrées à la ligne de base). */
const BAR_RADIUS = 3
/** Écart de surface entre deux barres adjacentes : elles ne doivent jamais se toucher. */
const BAR_GAP = 2

/** Échelle : le maximum de la série, jamais zéro (sinon division par zéro sur une série vide). */
function scaleOf(points: ChartPoint[]): number {
  return Math.max(1, ...points.map((point) => point.value))
}

/**
 * Quelques étiquettes seulement sur l'axe : première, dernière, et une au milieu. Écrire les
 * trente dates les ferait se chevaucher, et un axe illisible ne vaut pas mieux qu'un axe absent.
 */
function axisLabels(points: ChartPoint[]): Set<number> {
  if (points.length <= 2) return new Set(points.map((_, index) => index))
  return new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])
}

function ChartFrame({
  title,
  total,
  points,
  valueLabel,
  children,
  className,
}: {
  title: string
  /** Valeur mise en avant à côté du titre (déjà formatée). */
  total?: string
  points: ChartPoint[]
  /** Nom de la colonne de valeurs dans le tableau accessible. */
  valueLabel: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <figure className={cn("space-y-2", className)}>
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{title}</span>
        {total ? (
          <span className="text-xs text-muted-foreground tabular-nums">{total}</span>
        ) : null}
      </figcaption>

      {children}

      {/* Le même contenu, en tableau : la seule forme qu'un lecteur d'écran peut parcourir. */}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{point.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/** Barres verticales — comparaison de grandeurs indépendantes (activations par jour). */
export function BarChart({
  title,
  points,
  total,
  valueLabel,
  className,
}: {
  title: string
  points: ChartPoint[]
  total?: string
  valueLabel: string
  className?: string
}) {
  const max = scaleOf(points)
  const labels = axisLabels(points)
  const slot = VIEWBOX_WIDTH / Math.max(1, points.length)
  const barWidth = Math.max(2, slot - BAR_GAP)

  return (
    <ChartFrame
      title={title}
      total={total}
      points={points}
      valueLabel={valueLabel}
      className={className}
    >
      {/* Mise à l'échelle UNIFORME (pas de `preserveAspectRatio="none"`) : étirer le viewBox
          déformerait les glyphes des étiquettes et les pastilles de la courbe. Le rapport 4:1
          du viewBox donne une hauteur qui suit la largeur de la carte. */}
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={title}
      >
        {/* Ligne de base, recessive : elle situe le zéro sans attirer l'œil. */}
        <line
          x1="0"
          y1={PLOT_HEIGHT}
          x2={VIEWBOX_WIDTH}
          y2={PLOT_HEIGHT}
          className="stroke-border"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        {points.map((point, index) => {
          const height = (point.value / max) * (PLOT_HEIGHT - 4)
          const x = index * slot + BAR_GAP / 2
          return (
            <g key={point.label}>
              {/* Une barre à zéro ne dessine rien : sans ce garde, un rectangle de hauteur
                  négative (rayon > hauteur) apparaîtrait sous la ligne de base. */}
              {point.value > 0 ? (
                <rect
                  x={x}
                  y={PLOT_HEIGHT - height}
                  width={barWidth}
                  height={height}
                  rx={Math.min(BAR_RADIUS, height / 2)}
                  className="fill-primary/85 transition-opacity hover:fill-primary"
                />
              ) : null}
              {/* Cible de survol pleine hauteur : on n'exige pas de viser une barre de 3 px.
                  `<title>` donne l'infobulle native, disponible sans JavaScript. */}
              <rect
                x={x}
                y="0"
                width={barWidth}
                height={PLOT_HEIGHT}
                className="fill-transparent"
              >
                <title>{`${point.label} · ${point.value}`}</title>
              </rect>
              {labels.has(index) ? (
                <text
                  x={x + barWidth / 2}
                  y={VIEWBOX_HEIGHT - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {point.label}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
    </ChartFrame>
  )
}

/** Courbe + aire — un CUMUL qui ne redescend jamais (croissance du réseau). */
export function TrendChart({
  title,
  points,
  total,
  valueLabel,
  className,
}: {
  title: string
  points: ChartPoint[]
  total?: string
  valueLabel: string
  className?: string
}) {
  const gradientId = useId()
  const labels = axisLabels(points)
  const max = scaleOf(points)
  // Le cumul ne part pas de zéro (le réseau existait avant la fenêtre) : on cadre sur
  // [min, max] pour que la pente soit lisible, au lieu d'un trait plat en haut du dessin.
  const min = Math.min(...points.map((point) => point.value), max)
  const span = Math.max(1, max - min)

  const x = (index: number) =>
    points.length === 1 ? 0 : (index / (points.length - 1)) * VIEWBOX_WIDTH
  const y = (value: number) =>
    PLOT_HEIGHT - 4 - ((value - min) / span) * (PLOT_HEIGHT - 12)

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.value)}`)
    .join(" ")
  const area = `${line} L${VIEWBOX_WIDTH},${PLOT_HEIGHT} L0,${PLOT_HEIGHT} Z`

  return (
    <ChartFrame
      title={title}
      total={total}
      points={points}
      valueLabel={valueLabel}
      className={className}
    >
      {/* Mise à l'échelle UNIFORME (pas de `preserveAspectRatio="none"`) : étirer le viewBox
          déformerait les glyphes des étiquettes et les pastilles de la courbe. Le rapport 4:1
          du viewBox donne une hauteur qui suit la largeur de la carte. */}
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={title}
      >
        <defs>
          {/* Le dégradé part de la couleur COURANTE : il suit donc le thème comme le trait. */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="text-primary" stopColor="currentColor" stopOpacity="0.25" />
            <stop offset="100%" className="text-primary" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        <line
          x1="0"
          y1={PLOT_HEIGHT}
          x2={VIEWBOX_WIDTH}
          y2={PLOT_HEIGHT}
          className="stroke-border"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          className="stroke-primary"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {points.map((point, index) => (
          <g key={point.label}>
            <circle
              cx={x(index)}
              cy={y(point.value)}
              r="4"
              className="fill-primary opacity-0 hover:opacity-100"
            />
            <rect
              x={x(index) - VIEWBOX_WIDTH / Math.max(2, points.length * 2)}
              y="0"
              width={VIEWBOX_WIDTH / Math.max(1, points.length)}
              height={PLOT_HEIGHT}
              className="fill-transparent"
            >
              <title>{`${point.label} · ${point.value}`}</title>
            </rect>
            {labels.has(index) ? (
              <text
                x={x(index)}
                y={VIEWBOX_HEIGHT - 6}
                textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
                className="fill-muted-foreground text-[10px]"
              >
                {point.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </ChartFrame>
  )
}
