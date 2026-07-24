import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/common/page-header"
import { useT } from "@/i18n/use-t"
import type { TranslationKey } from "@/i18n/fr"

/**
 * Module déclaré dans la navigation mais pas encore construit. La structure des 12 modules
 * (spec §7.2) est en place dès la Tranche 8a : les tranches suivantes remplacent le contenu de
 * cette page, sans toucher au routage ni au menu.
 */
export function ComingSoonPage({ titleKey }: { titleKey: TranslationKey }) {
  const t = useT()
  return (
    <div className="space-y-6">
      <PageHeader
        title={t(titleKey)}
        actions={<Badge variant="secondary">{t("comingSoon.badge")}</Badge>}
      />
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {t("comingSoon.body")}
        </CardContent>
      </Card>
    </div>
  )
}
