import { useRef, useState } from "react"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from "lucide-react"
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
import { apiBaseUrl } from "@/api/client"
import { errorMessage } from "@/api/error"
import {
  useAddProductImage,
  useRemoveProductImage,
  useReorderProductImages,
  type Product,
} from "@/api/queries/catalog"
import { useT } from "@/i18n/use-t"
import { cn } from "@/lib/utils"

/** Alignés sur le backend (`MAX_IMAGES_PER_PRODUCT`, `MAX_PRODUCT_IMAGE_BYTES`). */
const MAX_IMAGES = 6
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = "image/jpeg,image/png,image/webp"

/**
 * PHOTOS D'UN PRODUIT (D-054, D-059, D-062) — dépôt, ordre, retrait.
 *
 * ═══ ON NE VOIT ET NE MANIPULE QUE DES POSITIONS ═══
 * Le contrat ne rend plus les chemins de stockage, seulement `imageCount`. Cet écran affiche
 * donc les photos par leur INDEX (`/shop/products/:id/images/:index`) et réordonne par
 * permutation d'entiers. Il n'existe aucun chemin de fichier à manipuler ici : c'est ce qui
 * garantit qu'aucune URL ne peut être fabriquée de travers.
 *
 * ═══ LA PREMIÈRE PHOTO EST CELLE QUE LE PORTAIL MET EN AVANT ═══
 * C'est la seule conséquence visible de l'ordre, et elle n'est pas devinable : la vignette du
 * catalogue affilié prend la position 0. L'écran le DIT et marque cette photo — sans quoi
 * réordonner ressemble à un rangement sans effet.
 *
 * ═══ LES FLÈCHES PLUTÔT QUE LE GLISSER-DÉPOSER ═══
 * Le glisser-déposer est plus élégant et inaccessible au clavier sans un travail considérable
 * (annonces ARIA, mode de saisie alternatif). Pour six vignettes au maximum, deux boutons
 * « avancer / reculer » font le même travail, fonctionnent au clavier et se testent.
 *
 * ═══ CE QUE L'ÉCRAN NE VÉRIFIE PAS ═══
 * Le TYPE réel du fichier. L'attribut `accept` et le contrôle de taille ci-dessous ne sont que
 * du confort — ils évitent d'envoyer 40 Mo pour rien. Le seul contrôle qui compte lit les
 * OCTETS du fichier côté serveur : un `.jpg` renommé depuis un exécutable passerait ici et
 * serait refusé là-bas.
 */
export function ProductImagesDialog({
  product,
  onClose,
}: {
  product: Product
  onClose: () => void
}) {
  const t = useT()
  const add = useAddProductImage()
  const remove = useRemoveProductImage()
  const reorder = useReorderProductImages()
  const fileInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * Compteur de MODIFICATIONS locales, ajouté à l'URL des vignettes.
   *
   * ═══ POURQUOI IL FAUT ÇA EN PLUS DE L'ETAG DU SERVEUR ═══
   * Ce sont deux problèmes différents, et aucun des deux ne résout l'autre.
   *
   * L'ETag règle la fraîcheur ENTRE deux chargements de page, pour tout le monde : sans lui,
   * un affilié ayant déjà vu l'ancienne couverture la garderait un an (l'en-tête promettait
   * `immutable`). C'est le vrai défaut, et il est corrigé côté serveur.
   *
   * Il ne règle PAS le rafraîchissement immédiat de cet écran-ci : après un réordonnancement,
   * l'URL de la vignette est inchangée, l'élément `<img>` n'est pas remonté, et le navigateur
   * réaffiche l'image qu'il a déjà décodée — sans même émettre la requête conditionnelle. Il
   * faut donc une URL DIFFÉRENTE pour le forcer.
   *
   * Le compteur est légitime ici, là où un `?v=` deviné ne l'était pas : cet écran ne devine
   * rien, il SAIT qu'il vient de modifier quelque chose.
   */
  const [revision, setRevision] = useState(0)

  const count = product.imageCount
  const busy = add.isPending || remove.isPending || reorder.isPending
  const full = count >= MAX_IMAGES

  async function upload(file: File) {
    setError(null)
    if (file.size > MAX_BYTES) {
      setError(t("productImages.tooLarge"))
      return
    }
    try {
      await add.mutateAsync({ id: product.id, file })
      setRevision((n) => n + 1)
      toast.success(t("productImages.added"))
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= count) return
    // Une PERMUTATION explicite de 0…n-1, avec deux positions échangées. Le backend refuse
    // tout ce qui n'en est pas une exactement — longueur, doublon, borne (D-062).
    const order = Array.from({ length: count }, (_, i) => i)
    order[index] = target
    order[target] = index
    setError(null)
    try {
      await reorder.mutateAsync({ id: product.id, order })
      setRevision((n) => n + 1)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  async function drop(index: number) {
    setError(null)
    try {
      await remove.mutateAsync({ id: product.id, index })
      setRevision((n) => n + 1)
      toast.success(t("productImages.removed"))
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("productImages.title")}</DialogTitle>
          <DialogDescription>
            {t("productImages.description", { name: product.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertDescription>{t("productImages.firstIsCover")}</AlertDescription>
          </Alert>

          {count === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("productImages.empty")}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: count }, (_, index) => (
                <li key={index} className="space-y-2">
                  <div
                    className={cn(
                      "relative overflow-hidden rounded-lg border",
                      index === 0 && "ring-2 ring-primary",
                    )}
                  >
                    <img
                      // `revision` force une NOUVELLE requête après chaque modification (voir
                      // le commentaire de son déclaration). Sans elle, l'écran continuerait
                      // d'afficher l'image déjà décodée, à URL inchangée.
                      src={`${apiBaseUrl}/shop/products/${product.id}/images/${index}?r=${revision}`}
                      alt={t("productImages.alt", {
                        name: product.name,
                        position: index + 1,
                      })}
                      className="aspect-[4/3] w-full bg-muted object-cover"
                    />
                    {index === 0 ? (
                      <span className="absolute start-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[0.7rem] font-medium text-primary-foreground">
                        <Star className="size-3" aria-hidden />
                        {t("productImages.cover")}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={t("productImages.moveBack", { position: index + 1 })}
                      disabled={busy || index === 0}
                      onClick={() => void move(index, -1)}
                    >
                      <ArrowLeft />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={t("productImages.moveForward", { position: index + 1 })}
                      disabled={busy || index === count - 1}
                      onClick={() => void move(index, 1)}
                    >
                      <ArrowRight />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="ms-auto text-destructive"
                      aria-label={t("productImages.remove", { position: index + 1 })}
                      disabled={busy}
                      onClick={() => void drop(index)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                // On vide l'input APRÈS lecture : sans cela, redéposer deux fois de suite le
                // MÊME fichier ne déclenche aucun `change` (la valeur n'a pas bougé).
                event.target.value = ""
                if (file) void upload(file)
              }}
            />
            <Button
              variant="outline"
              disabled={busy || full}
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus />
              {add.isPending ? t("productImages.uploading") : t("productImages.add")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {full
                ? t("productImages.limitReached", { max: MAX_IMAGES })
                : t("productImages.constraints", { max: MAX_IMAGES })}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
