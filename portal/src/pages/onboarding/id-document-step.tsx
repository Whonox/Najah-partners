import { useRef, useState } from "react"
import { FileUp, Upload } from "lucide-react"
import { errorMessage } from "@/api/error"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/use-t"
import { uploadIdDocument } from "./upload-id-document"

/** Doit rester aligné sur `MAX_ID_DOCUMENT_BYTES` côté backend. */
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = "image/jpeg,image/png,image/webp,application/pdf"

const DOC_TYPE_KEY: Record<string, "idCard" | "passport" | "license"> = {
  ID_CARD: "idCard",
  PASSPORT: "passport",
  DRIVING_LICENSE: "license",
}

/**
 * Étape 1 — dépôt de l'image de la pièce d'identité (D-050).
 *
 * ═══ LE TYPE ET LE NUMÉRO SONT RAPPELÉS, PAS REDEMANDÉS ═══
 * Ils ont été saisis à l'inscription (D-039). Les redemander ferait douter de ce qui a été
 * enregistré et ouvrirait un écart entre les deux saisies. Les AFFICHER, en revanche, permet
 * au membre de déposer la bonne pièce : c'est exactement l'information dont il a besoin à cet
 * instant.
 *
 * ═══ LA TAILLE EST VÉRIFIÉE AVANT L'ENVOI ═══
 * Non pas pour décider — le backend refuse de toute façon — mais pour ne pas faire téléverser
 * 12 Mo depuis un téléphone en 3G avant d'annoncer un refus.
 */
export function IdDocumentStep({
  documentType,
  documentNumber,
  onDone,
  onError,
}: {
  documentType: string | null
  documentNumber: string | null
  onDone: () => void
  onError: (message: string | null) => void
}) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  function pick(selected: File | null) {
    setLocalError(null)
    onError(null)
    if (selected && selected.size > MAX_BYTES) {
      setLocalError(t("onboarding.document.tooLarge"))
      setFile(null)
      return
    }
    setFile(selected)
  }

  async function submit() {
    if (!file) return
    setBusy(true)
    onError(null)
    try {
      await uploadIdDocument(file)
      onDone()
    } catch (cause) {
      onError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const typeLabel = documentType ? DOC_TYPE_KEY[documentType] : null

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("onboarding.document.intro")}</p>

      {/* Rappel de ce qui a été SAISI à l'inscription — la pièce à déposer doit correspondre. */}
      {(typeLabel || documentNumber) && (
        <dl className="divide-y rounded-lg border text-sm">
          {typeLabel && (
            <div className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-xs text-muted-foreground">
                {t("onboarding.document.declaredType")}
              </dt>
              <dd className="font-medium">
                {t(`register.identity.doc.${typeLabel}` as never)}
              </dd>
            </div>
          )}
          {documentNumber && (
            <div className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-xs text-muted-foreground">
                {t("onboarding.document.declaredNumber")}
              </dt>
              <dd className="font-mono font-medium">{documentNumber}</dd>
            </div>
          )}
        </dl>
      )}

      <div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          onChange={(event) => pick(event.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors hover:bg-muted"
        >
          <FileUp className="size-8 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">
            {file ? file.name : t("onboarding.document.choose")}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("onboarding.document.formats")}
          </span>
        </button>
      </div>

      {localError && (
        <p role="alert" className="text-sm text-destructive">
          {localError}
        </p>
      )}

      <Button className="w-full" disabled={!file || busy} onClick={() => void submit()}>
        <Upload className="size-4" />
        {busy ? t("onboarding.document.uploading") : t("onboarding.document.submit")}
      </Button>
    </div>
  )
}
