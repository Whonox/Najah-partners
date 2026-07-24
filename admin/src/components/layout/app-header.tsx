import { LogOut, Menu } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/auth/use-auth"
import { useT } from "@/i18n/use-t"
import type { TranslationKey } from "@/i18n/fr"
import { ThemeToggle } from "./theme-toggle"

/**
 * En-tête : ouverture du menu sur petit écran, thème, compte connecté (nom, e-mail, rôle) et
 * déconnexion. Volontairement plat — la barre de titre d'un outil de travail ne doit pas manger
 * la hauteur utile des tableaux.
 */
export function AppHeader({ onOpenNav }: { onOpenNav: () => void }) {
  const t = useT()
  const { admin, logout } = useAuth()

  const initials = (admin?.name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur supports-backdrop-filter:bg-background/70">
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        aria-label={t("nav.open")}
        onClick={onOpenNav}
      >
        <Menu />
      </Button>

      <div className="ms-auto flex items-center gap-1.5">
        <ThemeToggle />

        {admin ? (
          <>
            <Badge variant="outline" className="hidden sm:inline-flex">
              {t(`role.${admin.role}` as TranslationKey)}
            </Badge>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="sm" aria-label={t("session.account")} />
                }
              >
                <span
                  aria-hidden
                  className="flex size-6 items-center justify-center rounded-full bg-muted text-[0.65rem] font-semibold"
                >
                  {initials}
                </span>
                <span className="hidden max-w-40 truncate md:inline">{admin.name}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {/* `DropdownMenuLabel` est un `Menu.GroupLabel` de Base UI : hors d'un
                    `DropdownMenuGroup`, il lève à l'ouverture du menu. */}
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span className="truncate font-medium">{admin.name}</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      {admin.email}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {t(`role.${admin.role}` as TranslationKey)}
                    </span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => void logout()}>
                  <LogOut />
                  {t("session.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
      </div>
    </header>
  )
}
