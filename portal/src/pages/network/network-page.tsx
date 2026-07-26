import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DataState } from "@/components/common/data-state"
import { Explain, Notice } from "@/components/common/explain"
import { PageHeader } from "@/components/common/page-header"
import { myTreeQueryOptions, type TreeNode } from "@/api/queries/network"
import { profileQueryOptions } from "@/api/queries/me"
import { useT } from "@/i18n/use-t"
import { DownlinesTab } from "./downlines-tab"
import { TreeBreadcrumb, type TreeCrumb } from "./tree-breadcrumb"
import { VISIBLE_LEVELS } from "./tree-layout"
import { TreeView } from "./tree-view"

/**
 * MON RÉSEAU (spec §7.1.5 et §7.1.6) — deux façons de regarder la même chose : la FORME
 * (l'arbre) et la LISTE (les downlines). Deux onglets plutôt que deux écrans : c'est le même
 * sujet, et forcer un aller-retour de navigation pour passer de l'un à l'autre découragerait
 * de les croiser.
 *
 * L'écran porte aussi le rappel SPONSOR ≠ UPLINE DE PLACEMENT, qui n'a nulle part ailleurs
 * d'endroit naturel — et qui est la confusion la plus fréquente du modèle.
 */
export function NetworkPage() {
  const t = useT()
  const profile = useQuery(profileQueryOptions())

  // Recentrage : le CHEMIN parcouru depuis moi. Vide = je regarde ma propre position. Chaque
  // descente est une NOUVELLE requête bornée (le backend vérifie que la cible appartient bien
  // à mon sous-arbre — 403 sinon, D-055), jamais un dépliage cumulatif.
  //
  // On garde le chemin ENTIER et non le seul nœud courant : c'est lui qui alimente le fil
  // d'Ariane, et le contrat ne rend pas les ancêtres d'un nœud (il ne sait que descendre).
  const [path, setPath] = useState<TreeCrumb[]>([])
  const current = path.at(-1) ?? null
  const tree = useQuery(
    myTreeQueryOptions(current ? { rootMemberId: current.id, depth: VISIBLE_LEVELS - 1 } : { depth: VISIBLE_LEVELS - 1 }),
  )

  return (
    <div className="space-y-6">
      <PageHeader title={t("network.title")} description={t("network.subtitle")} />

      <Tabs defaultValue="tree">
        <TabsList>
          <TabsTrigger value="tree">{t("network.tabTree")}</TabsTrigger>
          <TabsTrigger value="downlines">{t("network.tabDownlines")}</TabsTrigger>
        </TabsList>

        <TabsContent value="tree" className="space-y-4 pt-4">
          {/* Sponsor et upline de placement, côte à côte et nommés : c'est le seul endroit du
              portail où l'affilié peut voir les deux en même temps et comprendre la différence. */}
          {profile.data ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("explain.sponsorVsUpline.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Relation
                    label={t("network.sponsor")}
                    name={
                      profile.data.sponsor
                        ? `${profile.data.sponsor.firstName} ${profile.data.sponsor.lastName}`
                        : null
                    }
                    code={profile.data.sponsor?.memberCode ?? null}
                    empty={t("network.noSponsor")}
                  />
                  <Relation
                    label={t("network.upline")}
                    name={
                      profile.data.upline
                        ? `${profile.data.upline.firstName} ${profile.data.upline.lastName}`
                        : null
                    }
                    code={profile.data.upline?.memberCode ?? null}
                    empty={t("network.noUpline")}
                    detail={
                      profile.data.leg
                        ? t("network.uplineLeg", {
                            leg:
                              profile.data.leg === "LEFT"
                                ? t("network.legLeft")
                                : t("network.legRight"),
                          })
                        : undefined
                    }
                  />
                </div>
                <Explain
                  titleKey="explain.sponsorVsUpline.title"
                  bodyKey="explain.sponsorVsUpline.body"
                />
              </CardContent>
            </Card>
          ) : null}

          <Notice>{t("network.boundedNotice")}</Notice>

          <TreeBreadcrumb
            path={path}
            onNavigate={(index) =>
              setPath((crumbs) => (index === null ? [] : crumbs.slice(0, index + 1)))
            }
          />

          <DataState
            isLoading={tree.isPending}
            error={tree.error}
            onRetry={() => void tree.refetch()}
            rows={3}
          >
            {tree.data ? (
              <TreeView
                root={tree.data as TreeNode}
                isSelf={current === null}
                onFocus={(node) =>
                  setPath((crumbs) =>
                    // Recentrer sur le nœud DÉJÀ affiché en racine ne mène nulle part : on
                    // empilerait un cran identique et le fil se remplirait de doublons.
                    crumbs.at(-1)?.id === node.id
                      ? crumbs
                      : [
                          ...crumbs,
                          {
                            id: node.id,
                            label: `${node.firstName} ${node.lastName}`,
                          },
                        ],
                  )
                }
              />
            ) : null}
          </DataState>
        </TabsContent>

        <TabsContent value="downlines" className="pt-4">
          <DownlinesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Relation({
  label,
  name,
  code,
  empty,
  detail,
}: {
  label: string
  name: string | null
  code: string | null
  empty: string
  detail?: string
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {name ? (
        <>
          <p className="mt-1 truncate font-medium">{name}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{code}</p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{empty}</p>
      )}
      {detail ? <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  )
}
