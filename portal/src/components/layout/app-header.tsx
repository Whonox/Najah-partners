import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MemberStatusBadge } from "@/components/common/status-badge"
import { useAuth } from "@/auth/use-auth"
import { useT } from "@/i18n/use-t"
import { Brand } from "./brand"
import { ThemeToggle } from "./theme-toggle"

/**
 * En-tête du portail.
 *
 * Sur téléphone, la navigation est en BAS (barre d'onglets) : l'en-tête n'a donc aucun bouton
 * de menu à porter et se réduit à l'identité, au nom de l'affilié et aux deux réglages. C'est
 * de la place rendue au contenu, qui est ce que l'affilié vient voir.
 *
 * Le STATUT du compte y est affiché en permanence, et ce n'est pas décoratif : « gelé » change
 * la lecture de tout le reste de l'écran — les commissions affichées ne seront pas versées.
 * Le laisser au seul tableau de bord le rendrait invisible depuis les autres écrans.
 */
export function AppHeader() {
  const t = useT()
  const { member, logout } = useAuth()

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
      <div className="lg:hidden">
        <Brand />
      </div>

      <div className="ms-auto flex items-center gap-2 lg:ms-0 lg:flex-1">
        {member ? (
          <div className="hidden min-w-0 flex-col leading-tight sm:flex">
            <span className="truncate text-sm font-medium">
              {member.firstName} {member.lastName}
            </span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {member.memberCode}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5">
        {member ? <MemberStatusBadge status={member.status} /> : null}
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("session.logout")}
          onClick={() => void logout()}
        >
          <LogOut />
        </Button>
      </div>
    </header>
  )
}
