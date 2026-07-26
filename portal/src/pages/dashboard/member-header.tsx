import { BadgeCheck, Clock } from "lucide-react"
import { CopyButton } from "@/components/common/copy-button"
import { useT } from "@/i18n/use-t"
import { cn } from "@/lib/utils"
import type { MemberProfile } from "@/api/queries/me"

/**
 * EN-TÊTE PERSONNEL de l'accueil (D-053).
 *
 * ═══ CE QUI SÉPARE UN ESPACE MEMBRE D'UN TABLEAU DE BORD ═══
 * Un tableau de bord commence par des chiffres ; un espace personnel commence par la
 * personne. D'où une salutation, un prénom, et seulement ensuite ce qui identifie le compte.
 * Le reproche fait à la Tranche 9 était exactement là : l'accueil ouvrait sur une grille de
 * cartes plates, comme le back-office.
 *
 * ═══ LE CODE MEMBRE EST COPIABLE, ET C'EST FONCTIONNEL ═══
 * C'est l'identifiant de connexion (aucun canal ne le rappelle — D-011) ET le code à
 * transmettre à un filleul. Le mettre à portée de copie ici évite d'aller le chercher dans
 * « Parrainer » à chaque fois.
 *
 * ═══ AUCUN MONTANT (D-053) ═══
 * Ni solde, ni gains. Le pack et le statut ne sont pas de l'argent : ils disent qui l'on est
 * dans le réseau.
 */
export function MemberHeader({
  profile,
  packName,
  status,
}: {
  profile: MemberProfile
  packName: string | null
  status: "REGISTERED" | "ACTIVE" | "INACTIVE"
}) {
  const t = useT()

  return (
    <header className="rounded-2xl bg-surface-soft p-5 sm:p-7">
      <p className="text-sm text-muted-foreground">{t("home.greeting")}</p>
      <h1 className="mt-0.5 text-2xl font-semibold text-surface-soft-foreground sm:text-3xl">
        {profile.firstName} {profile.lastName}
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1.5 text-sm">
          <span className="text-muted-foreground">{t("home.memberCode")}</span>
          <span className="font-mono font-semibold tracking-wider">
            {profile.memberCode}
          </span>
          <CopyButton
            value={profile.memberCode}
            label={t("action.copy")}
            iconOnly
            className="-me-1.5 size-7"
          />
        </span>

        {packName && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-3 py-1.5 text-sm font-medium text-foreground">
            <BadgeCheck className="size-4 text-primary" aria-hidden />
            {packName}
          </span>
        )}

        <StatusPill status={status} />

        {/* Vérification d'identité — INFORMATIVE, elle ne bloque rien (D-018). Elle a sa place
            ici parce qu'un membre qui vient de déposer sa pièce se demande où en est son
            dossier ; elle n'y a sa place QUE tant qu'elle est en attente. */}
        {profile.verification.status === "PENDING" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" aria-hidden />
            {t("home.verificationPending")}
          </span>
        )}
      </div>
    </header>
  )
}

function StatusPill({ status }: { status: "REGISTERED" | "ACTIVE" | "INACTIVE" }) {
  const t = useT()

  // Trois états, trois tons — jamais rouge pour INACTIVE : un compte gelé n'est pas une
  // erreur, c'est une situation réversible, et le bandeau d'action juste en dessous dit
  // déjà quoi faire. L'alarmer deux fois n'aide personne.
  const tone =
    status === "ACTIVE"
      ? "bg-success/15 text-foreground"
      : status === "INACTIVE"
        ? "bg-warning/15 text-foreground"
        : "bg-background/70 text-muted-foreground"

  return (
    <span className={cn("rounded-full px-3 py-1.5 text-sm font-medium", tone)}>
      {t(`status.${status}` as never)}
    </span>
  )
}
