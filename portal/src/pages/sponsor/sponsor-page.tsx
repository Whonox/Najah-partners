import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { CreditCard, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/common/copy-button"
import { DataState } from "@/components/common/data-state"
import { Explain, Notice } from "@/components/common/explain"
import { PageHeader } from "@/components/common/page-header"
import { Surface, SurfaceHeader } from "@/components/common/surface"
import { profileQueryOptions } from "@/api/queries/me"
import { useT } from "@/i18n/use-t"

/**
 * PARRAINER (spec §7.1.2).
 *
 * ═══ CE QUE CET ÉCRAN NE FAIT PAS, ET POURQUOI ═══
 * Il n'inscrit personne. L'inscription est un endpoint PUBLIC et ANONYME (D-021) : c'est le
 * FILLEUL qui remplit le formulaire, saisit ses propres coordonnées, choisit sa position et
 * règle ses frais. Un parrain qui inscrirait à la place de son filleul créerait un compte dont
 * il connaîtrait le mot de passe — et le filleul hériterait d'une place qu'il n'a pas choisie,
 * alors que le placement est IMMUABLE (D-013).
 *
 * Il n'y a pas non plus de lien de parrainage pré-rempli : aucune route publique ne prend de
 * code sponsor en paramètre. On ne l'invente pas — on donne le code, de quoi le copier, et la
 * marche à suivre. Le jour où la vitrine (Tranche 10) exposera un formulaire paramétrable, le
 * lien pourra s'ajouter ici sans rien changer d'autre.
 *
 * Le seul geste concret que le parrain peut faire pour son filleul est de lui CRÉER L'E-CARD
 * des frais d'inscription (D-036) : le raccourci est donc proposé.
 */
export function SponsorPage() {
  const t = useT()
  const profile = useQuery(profileQueryOptions())

  return (
    <div className="space-y-6">
      <PageHeader title={t("sponsor.title")} description={t("sponsor.subtitle")} />

      <DataState
        isLoading={profile.isPending}
        error={profile.error}
        onRetry={() => void profile.refetch()}
        rows={2}
      >
        {profile.data ? (
          <div className="space-y-5">
            {/* LE CODE, en pleine surface dorée. C'est la seule chose que le parrain a
                réellement à transmettre : il mérite d'être la première et la plus grande. */}
            <Surface variant="highlight" padding="roomy" className="text-center">
              <p className="text-sm font-medium text-highlight-foreground/70">
                {t("sponsor.myCode")}
              </p>
              <p className="mt-3 font-mono text-3xl font-semibold tracking-widest select-all">
                {profile.data.memberCode}
              </p>
              <div className="mt-4 flex justify-center">
                <CopyButton
                  value={profile.data.memberCode}
                  label={t("sponsor.copy")}
                  successMessage={t("sponsor.copied")}
                />
              </div>
            </Surface>

            <Notice
              title={t("sponsor.noLinkTitle")}
              icon={<Info className="size-4 shrink-0" aria-hidden />}
            >
              {t("sponsor.noLink")}
            </Notice>

            <Surface as="section">
              <SurfaceHeader title={t("sponsor.howTitle")} />
              <ol className="space-y-3">
                {(
                  [
                    "sponsor.step1",
                    "sponsor.step2",
                    "sponsor.step3",
                    "sponsor.step4",
                    "sponsor.step5",
                  ] as const
                ).map((key, index) => (
                  <li key={key} className="flex gap-3">
                    <span
                      aria-hidden
                      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                    >
                      {index + 1}
                    </span>
                    <span className="text-sm leading-relaxed">{t(key)}</span>
                  </li>
                ))}
              </ol>

              {/* Le SEUL geste concret que le parrain peut faire pour son filleul : lui créer
                  l'e-card des frais d'inscription (D-036). Il est donc dans le mode d'emploi,
                  à l'étape où il sert, et non relégué en bas de page. */}
              <Button
                variant="outline"
                className="mt-4"
                nativeButton={false}
                render={<Link to="/e-cards" />}
              >
                <CreditCard />
                {t("sponsor.createEcard")}
              </Button>
            </Surface>

            <Explain
              titleKey="explain.sponsorVsUpline.title"
              bodyKey="explain.sponsorVsUpline.body"
            />
            <Explain titleKey="explain.direct.title" bodyKey="explain.direct.body" />
          </div>
        ) : null}
      </DataState>
    </div>
  )
}
