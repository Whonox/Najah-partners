import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/use-t"

export function NotFoundPage() {
  const t = useT()

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
      <h1 className="text-xl font-semibold">{t("state.notFound")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t("state.notFoundHint")}</p>
      <Button nativeButton={false} render={<Link to="/" />}>{t("state.backHome")}</Button>
    </div>
  )
}
