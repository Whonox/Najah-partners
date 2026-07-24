import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/use-t"
import { HOME_PATH } from "@/lib/nav"

export function NotFoundPage() {
  const t = useT()
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <h1 className="text-xl font-semibold">{t("state.notFoundTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("state.notFoundBody")}</p>
      <Button render={<Link to={HOME_PATH} />} variant="outline">
        {t("state.backToDashboard")}
      </Button>
    </div>
  )
}
