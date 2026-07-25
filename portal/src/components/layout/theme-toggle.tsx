import { Monitor, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useT } from "@/i18n/use-t"
import { useTheme } from "@/theme/use-theme"
import type { ThemePreference } from "@/theme/theme-context"

const ICONS: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

/**
 * Sélecteur clair / sombre / système. L'icône du bouton montre le thème RÉELLEMENT appliqué
 * (en mode « système », celui que l'OS impose), la coche montre le choix enregistré.
 */
export function ThemeToggle() {
  const t = useT()
  const { preference, resolved, setPreference } = useTheme()
  const Icon = ICONS[preference === "system" ? resolved : preference]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={t("theme.label")} />}
      >
        <Icon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => setPreference(value as ThemePreference)}
        >
          <DropdownMenuRadioItem value="light">
            <Sun />
            {t("theme.light")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon />
            {t("theme.dark")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor />
            {t("theme.system")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
