import { useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectOptions,
  SelectTrigger,
  SelectValue,
  type SelectOption,
} from "@/components/ui/select"
import { ADMIN_ROLES, type AdminRoleValue } from "@/api/enums"
import { errorMessage } from "@/api/error"
import {
  useCreateAdminUser,
  useResetAdminPassword,
  useUpdateAdminUser,
  type AdminUser,
} from "@/api/queries/admin-users"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { useT } from "@/i18n/use-t"

/** Aligné sur la validation du backend : c'est lui qui refuse, on évite juste l'aller-retour. */
const PASSWORD_MIN = 10
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Création / modification d'un compte administrateur.
 *
 * Le mot de passe initial est POSÉ ici et transmis hors plateforme : il n'existe aucun
 * fournisseur d'envoi d'e-mail (D-011), et afficher « un lien vient d'être envoyé » serait
 * mentir. Le champ n'apparaît donc qu'à la création — modifier un compte ne touche jamais son
 * mot de passe (c'est la réinitialisation, un geste distinct et explicite).
 */
export function AdminUserDialog({
  admin,
  onClose,
}: {
  /** Absent = création. */
  admin?: AdminUser
  onClose: () => void
}) {
  const t = useT()
  const create = useCreateAdminUser()
  const update = useUpdateAdminUser()
  const isEdit = admin !== undefined

  const [name, setName] = useState(admin?.name ?? "")
  const [email, setEmail] = useState(admin?.email ?? "")
  const [role, setRole] = useState<AdminRoleValue>(admin?.role ?? "SUPPORT")
  const [password, setPassword] = useState("")

  const validName = name.trim().length >= 2
  const validEmail = isEdit || EMAIL_PATTERN.test(email.trim())
  const validPassword = isEdit || password.length >= PASSWORD_MIN
  const pending = create.isPending || update.isPending

  const roleOptions: SelectOption[] = ADMIN_ROLES.map((value) => ({
    value,
    label: t(`role.${value}`),
  }))

  function submit() {
    const handlers = {
      onSuccess: () => {
        toast.success(isEdit ? t("adminUsers.updated") : t("adminUsers.created"))
        onClose()
      },
      onError: (error: unknown) =>
        toast.error(t("adminUsers.saveFailed"), { description: errorMessage(error) }),
    }

    if (isEdit) {
      // On n'envoie QUE ce qui a changé : envoyer `role` inchangé ferait révoquer les sessions
      // du compte côté serveur pour rien (tout changement de rôle les révoque).
      update.mutate(
        {
          id: admin.id,
          body: {
            ...(name.trim() !== admin.name ? { name: name.trim() } : {}),
            ...(role !== admin.role ? { role } : {}),
          },
        },
        handlers,
      )
    } else {
      create.mutate(
        { name: name.trim(), email: email.trim(), role, password },
        handlers,
      )
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("adminUsers.editTitle") : t("adminUsers.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("adminUsers.rolesFixed")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="admin-name">{t("adminUsers.name")}</Label>
            <Input
              id="admin-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="admin-email">{t("adminUsers.email")}</Label>
            <Input
              id="admin-email"
              type="email"
              value={email}
              // L'adresse est l'identifiant de connexion : la changer ferait d'un compte un
              // autre. On la fige après création.
              disabled={isEdit}
              onChange={(event) => setEmail(event.target.value)}
            />
            {!isEdit && email.trim() !== "" && !validEmail ? (
              <p className="text-xs text-destructive">
                {t("adminUsers.emailInvalid")}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label>{t("adminUsers.role")}</Label>
            <Select
              options={roleOptions}
              value={role}
              onValueChange={(value) => setRole(value as AdminRoleValue)}
            >
              <SelectTrigger aria-label={t("adminUsers.role")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectOptions options={roleOptions} />
              </SelectContent>
            </Select>
          </div>

          {!isEdit ? (
            <div className="grid gap-1.5">
              <Label htmlFor="admin-password">{t("adminUsers.password")}</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("adminUsers.passwordHint")}
              </p>
              {password !== "" && !validPassword ? (
                <p className="text-xs text-destructive">
                  {t("adminUsers.passwordTooShort")}
                </p>
              ) : null}
            </div>
          ) : null}

          {isEdit ? (
            <Alert>
              <AlertDescription>{t("adminUsers.activeHint")}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!validName || !validEmail || !validPassword || pending}
            onClick={submit}
          >
            {pending ? t("common.pending") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Réinitialisation de mot de passe : le super-admin pose la valeur, et les sessions du compte
 * sont révoquées. La confirmation le dit — si la réinitialisation vient d'un soupçon de
 * compromission, laisser les sessions vivantes n'aurait rien réglé.
 */
export function ResetPasswordDialog({
  admin,
  onClose,
}: {
  admin: AdminUser
  onClose: () => void
}) {
  const t = useT()
  const reset = useResetAdminPassword()
  const [password, setPassword] = useState("")
  const [confirming, setConfirming] = useState(false)

  const valid = password.length >= PASSWORD_MIN

  function submit() {
    reset.mutate(
      { id: admin.id, password },
      {
        onSuccess: () => {
          toast.success(t("adminUsers.resetDone"))
          onClose()
        },
        onError: (error) => {
          toast.error(t("adminUsers.resetFailed"), {
            description: errorMessage(error),
          })
          setConfirming(false)
        },
      },
    )
  }

  return (
    <>
      <Dialog open={!confirming} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminUsers.resetTitle")}</DialogTitle>
            <DialogDescription>{t("adminUsers.resetDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              {admin.name} — {admin.email}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reset-password">
                {t("adminUsers.resetNewPassword")}
              </Label>
              <Input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("adminUsers.passwordHint")}
              </p>
              {password !== "" && !valid ? (
                <p className="text-xs text-destructive">
                  {t("adminUsers.passwordTooShort")}
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button disabled={!valid} onClick={() => setConfirming(true)}>
              {t("adminUsers.resetConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        title={t("adminUsers.resetTitle")}
        summary={`${admin.name} — ${admin.email}`}
        consequence={t("adminUsers.resetConsequence")}
        confirmLabel={t("adminUsers.resetConfirm")}
        pending={reset.isPending}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}
