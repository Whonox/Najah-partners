import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectOptions,
  SelectTrigger,
  SelectValue,
  type SelectOption,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { DataState } from "@/components/common/data-state"
import { MemberStatusBadge } from "@/components/common/status-badge"
import { PointsBv } from "@/components/format/amount"
import { myDownlinesQueryOptions, type DownlineRow } from "@/api/queries/network"
import type { Leg, MemberStatus } from "@/api/enums"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"

const PAGE_SIZE = 20
/** Valeur « pas de filtre » : un `<Select>` ne sait pas rendre `undefined`. */
const ANY = "__any__"

/**
 * LA LISTE DES DOWNLINES (spec §7.1.6).
 *
 * Recherche, filtres et pagination sont faits par le BACKEND : filtrer les 20 lignes reçues
 * donnerait un résultat faux dès la 21ᵉ.
 *
 * DEUX INFORMATIONS QU'IL NE FAUT PAS CONFONDRE, et que l'écran sépare visuellement :
 *  — la JAMBE (`rootLeg`) : de quel côté DE MOI ce membre se trouve, donc quelle jambe ses
 *    points ont alimentée ;
 *  — le PARRAINAGE (`isDirectReferral`) : est-ce MOI qui l'ai fait venir, ce qui m'a valu une
 *    commission directe.
 * Un membre peut être dans ma jambe gauche sans que je l'aie parrainé, et inversement. C'est
 * la confusion la plus fréquente du modèle, d'où deux marqueurs distincts plutôt qu'un seul.
 *
 * Les POINTS APPORTÉS sont le palier figé à SON activation : un membre non activé n'a rien
 * injecté (D-005), et la colonne le dit plutôt que d'afficher zéro — « rien » et « zéro » ne
 * racontent pas la même histoire.
 */
export function DownlinesTab() {
  const t = useT()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<MemberStatus | undefined>()
  const [leg, setLeg] = useState<Leg | undefined>()
  const [directOnly, setDirectOnly] = useState(false)

  const downlines = useQuery(
    myDownlinesQueryOptions({
      page,
      pageSize: PAGE_SIZE,
      search: search.trim() === "" ? undefined : search.trim(),
      status,
      leg,
      directReferralsOnly: directOnly ? true : undefined,
    }),
  )

  const statusOptions: SelectOption[] = [
    { value: ANY, label: t("downlines.filterAll") },
    { value: "REGISTERED", label: t("status.REGISTERED") },
    { value: "ACTIVE", label: t("status.ACTIVE") },
    { value: "INACTIVE", label: t("status.INACTIVE") },
  ]
  const legOptions: SelectOption[] = [
    { value: ANY, label: t("downlines.filterAll") },
    { value: "LEFT", label: t("network.legLeft") },
    { value: "RIGHT", label: t("network.legRight") },
  ]

  const total = downlines.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const filtered = search !== "" || status !== undefined || leg !== undefined || directOnly

  /** Tout changement de filtre remet à la page 1 : rester en page 3 d'un résultat qui n'en a
      plus qu'une afficherait un vide trompeur. */
  function withReset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex-1 space-y-1.5 sm:min-w-56">
          <Label htmlFor="downlines-search">{t("downlines.search")}</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="downlines-search"
              value={search}
              className="ps-8"
              onChange={(event) => withReset(setSearch)(event.target.value)}
            />
          </div>
        </div>

        <div className="w-full space-y-1.5 sm:w-40">
          <Label>{t("downlines.filterStatus")}</Label>
          <Select
            options={statusOptions}
            value={status ?? ANY}
            onValueChange={(value) =>
              withReset(setStatus)(value === ANY ? undefined : (value as MemberStatus))
            }
          >
            <SelectTrigger aria-label={t("downlines.filterStatus")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectOptions options={statusOptions} />
            </SelectContent>
          </Select>
        </div>

        <div className="w-full space-y-1.5 sm:w-40">
          <Label>{t("downlines.filterLeg")}</Label>
          <Select
            options={legOptions}
            value={leg ?? ANY}
            onValueChange={(value) =>
              withReset(setLeg)(value === ANY ? undefined : (value as Leg))
            }
          >
            <SelectTrigger aria-label={t("downlines.filterLeg")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectOptions options={legOptions} />
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2.5 pb-1">
          <Switch
            id="direct-only"
            checked={directOnly}
            onCheckedChange={(checked) => withReset(setDirectOnly)(checked)}
          />
          <Label htmlFor="direct-only">{t("downlines.directOnly")}</Label>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{t("downlines.count", { count: total })}</p>

      <DataState
        isLoading={downlines.isPending}
        error={downlines.error}
        isEmpty={downlines.data?.items.length === 0}
        emptyMessage={filtered ? t("downlines.empty") : t("downlines.emptyAll")}
        onRetry={() => void downlines.refetch()}
      >
        <ul className="space-y-3">
          {(downlines.data?.items ?? []).map((row) => (
            <li key={row.id}>
              <DownlineCard row={row} />
            </li>
          ))}
        </ul>

        {pages > 1 ? (
          <nav className="flex items-center justify-between gap-3 pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              {t("action.previous")}
            </Button>
            <span className="text-sm text-muted-foreground">
              {t("action.page", { page, pages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage((current) => current + 1)}
            >
              {t("action.next")}
            </Button>
          </nav>
        ) : null}
      </DataState>
    </div>
  )
}

function DownlineCard({ row }: { row: DownlineRow }) {
  const t = useT()

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          {/* La pastille de jambe : même code couleur que l'arbre et le tableau de bord. */}
          <span
            aria-hidden
            className={cn(
              "mt-1.5 size-2.5 shrink-0 rounded-full",
              row.rootLeg === "LEFT" ? "bg-leg-left" : "bg-leg-right",
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">
              {row.firstName} {row.lastName}
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {row.memberCode}
            </p>
          </div>
          <MemberStatusBadge status={row.status} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {row.rootLeg === "LEFT" ? t("network.legLeft") : t("network.legRight")}
          </Badge>
          <Badge variant="outline">{t("network.depth", { depth: row.depth })}</Badge>
          {row.packName ? <Badge variant="secondary">{row.packName}</Badge> : null}
          {/* Le parrainage est une information de NATURE différente de la position : il vaut
              une commission directe, alors que la jambe alimente le binaire. */}
          {row.isDirectReferral ? <Badge>{t("network.directReferral")}</Badge> : null}
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">{t("downlines.activatedAt")}</dt>
            <dd>
              {row.activatedAt
                ? formatDateTime(row.activatedAt)
                : t("downlines.notActivated")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("downlines.contributed")}</dt>
            <dd>
              {row.contributedPoints !== null && row.contributedPoints !== undefined ? (
                <PointsBv value={row.contributedPoints} />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
