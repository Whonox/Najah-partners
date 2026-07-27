import { Link } from "react-router"
import { LogOut, Monitor, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MemberStatusBadge } from "@/components/common/status-badge"
import { useAuth } from "@/auth/use-auth"
import { useT } from "@/i18n/use-t"
import { ACCOUNT_NAV } from "@/lib/nav"
import { useTheme } from "@/theme/use-theme"
import type { ThemePreference } from "@/theme/theme-context"

/**
 * MENU COMPTE — l'identité de l'affilié, ses écrans personnels et ses réglages, sous un seul
 * point d'entrée à droite de la barre.
 *
 * ═══ CE QU'IL RÉPARE ═══
 * L'en-tête d'application affichait en permanence le nom et le code membre… que l'en-tête
 * personnel de l'accueil répétait 80 px plus bas (signalé dès la Phase 6a de la Tranche 9.5).
 * La même identité s'affichait deux fois, à un écran d'intervalle. Elle vit désormais ICI, à un
 * clic — et l'accueil GARDE son en-tête personnel, avec sa salutation et son code copiable :
 * c'est le chrome qui s'allège, pas l'espace membre.
 *
 * ═══ LE STATUT N'EST AFFICHÉ DANS LA BARRE QUE S'IL APPELLE UNE ACTION ═══
 * Un badge « Actif » permanent est du décor : il ne dit rien qu'on ne sache déjà. « Gelé »,
 * lui, change la lecture de TOUT le reste de l'écran — les commissions affichées ne seront pas
 * versées (D-034). Seul ce cas sort du menu pour se poser dans la barre, à toutes les largeurs.
 * Les trois états restent lisibles dans le menu, sous le nom.
 *
 * ═══ LE THÈME EST EN LIGNE, PAS EN SOUS-MENU ═══
 * Trois options ne valent pas un second niveau de navigation : un sous-menu ajoute une
 * mécanique d'ouverture (souris, clavier, toucher) pour économiser deux lignes.
 * `ThemeToggle` reste par ailleurs en place sur les écrans PUBLICS (connexion, inscription,
 * première connexion), qui n'ont pas de menu compte.
 */
export function AccountMenu() {
  const t = useT()
  const { member, logout } = useAuth()
  const { preference, resolved, setPreference } = useTheme()

  if (!member) return null

  const fullName = `${member.firstName} ${member.lastName}`.trim()

  return (
    <>
      {member.status === "INACTIVE" && <MemberStatusBadge status={member.status} />}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-full bg-primary/12 text-sm font-semibold text-foreground hover:bg-primary/20"
              aria-label={t("account.label")}
            />
          }
        >
          <span aria-hidden>
            {initials(member.firstName, member.lastName, member.memberCode)}
          </span>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-1.5">
          {/* Le bloc d'identité est le LIBELLÉ du groupe « mon compte » — il n'est donc pas
              interactif (le clavier le traverserait comme une commande qui ne fait rien), et il
              nomme les deux écrans qui le suivent. Base UI exige qu'un libellé vive DANS son
              groupe : hors `Group` ou `RadioGroup`, le composant lève et emporte tout le
              chrome avec lui (la limite d'erreur, elle, n'entoure que l'écran). */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2 py-2">
              <span className="block truncate text-sm font-semibold text-foreground">
                {fullName}
              </span>
              <span className="mt-0.5 block truncate font-mono text-xs tracking-wider text-muted-foreground">
                {member.memberCode}
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                <MemberStatusBadge status={member.status} />
                {/* Le pack n'existe qu'après activation — un INSCRIT n'en a aucun (D-013), et
                    écrire « — » à sa place laisserait croire à une donnée manquante. */}
                {member.pack && (
                  <span className="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-medium text-foreground">
                    {member.pack.packName}
                  </span>
                )}
              </span>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            {ACCOUNT_NAV.map((entry) => (
              <DropdownMenuItem
                key={entry.path}
                className="px-2 py-2"
                render={<Link to={`/${entry.path}`} />}
              >
                <entry.icon aria-hidden />
                {t(entry.labelKey)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuRadioGroup
            value={preference}
            onValueChange={(value) => setPreference(value as ThemePreference)}
          >
            <DropdownMenuLabel>{t("theme.label")}</DropdownMenuLabel>
            <DropdownMenuRadioItem value="light" className="px-2 py-2">
              <Sun aria-hidden />
              {t("theme.light")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark" className="px-2 py-2">
              <Moon aria-hidden />
              {t("theme.dark")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system" className="px-2 py-2">
              <Monitor aria-hidden />
              {t("theme.system")}
              {/* En mode « système », dire lequel est appliqué : sans cela, l'affilié ne sait
                  pas ce que son choix produit. */}
              <span className="ms-auto text-xs text-muted-foreground">
                {t(resolved === "dark" ? "theme.dark" : "theme.light")}
              </span>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            className="px-2 py-2"
            onClick={() => void logout()}
          >
            <LogOut aria-hidden />
            {t("session.logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

/**
 * Initiales de l'avatar. Les prénoms et noms viennent d'une saisie libre : un champ réduit à
 * des espaces produirait une pastille vide plutôt qu'une erreur — d'où le repli sur la
 * première lettre du code membre, qui, lui, existe toujours.
 */
function initials(firstName: string, lastName: string, memberCode: string): string {
  const letters = [firstName, lastName]
    .map((part) => part.trim().charAt(0))
    .filter(Boolean)
    .join("")
  return (letters || memberCode.trim().charAt(0)).toUpperCase()
}
