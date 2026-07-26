import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/api/client"
import { unwrap } from "@/api/error"

/** Les quatre étapes du formulaire public (D-052), dans l'ordre imposé par le parcours. */
export const REGISTER_STEPS = ["sponsor", "identity", "placement", "payment"] as const
export type RegisterStep = (typeof REGISTER_STEPS)[number]

export type IdDocumentType = "ID_CARD" | "DRIVING_LICENSE" | "PASSPORT"
export type Leg = "LEFT" | "RIGHT"

/**
 * État du formulaire d'inscription.
 *
 * Il vit en mémoire, dans le composant, et NULLE PART ailleurs : ni `localStorage`, ni URL.
 * Un brouillon d'inscription porte un mot de passe en clair et des codes d'e-card — c'est-à-dire
 * de la valeur au porteur. Le persister pour offrir une reprise après fermeture d'onglet
 * laisserait tout cela sur la machine, y compris sur un poste partagé.
 */
export interface RegistrationForm {
  sponsorCode: string
  lastName: string
  firstName: string
  email: string
  phone: string
  password: string
  passwordConfirm: string
  idDocumentType: IdDocumentType
  idDocumentNumber: string
  uplineCode: string
  leg: Leg | ""
  ecardCodes: string[]
  termsAccepted: boolean
}

export const EMPTY_FORM: RegistrationForm = {
  sponsorCode: "",
  lastName: "",
  firstName: "",
  email: "",
  phone: "",
  password: "",
  passwordConfirm: "",
  idDocumentType: "ID_CARD",
  idDocumentNumber: "",
  uplineCode: "",
  leg: "",
  ecardCodes: [""],
  termsAccepted: false,
}

/** Tarif d'inscription, LU depuis l'API (D-036) — jamais écrit en dur dans l'interface. */
export function useRegistrationFee() {
  return useQuery({
    queryKey: ["public", "registration-fee"],
    queryFn: async () => unwrap(await apiClient.GET("/members/registration-fee")),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Forme d'un code membre : `NP` suivi d'EXACTEMENT six chiffres.
 *
 * ═══ POURQUOI SIX, ET POURQUOI C'EST SANS RISQUE DE FUITE ═══
 * C'est le format réellement attribué (`NP` + compteur cadré à six). Le contrôler ici évite
 * qu'une saisie manifestement tronquée — `NP0003` — traverse trois étapes avant d'être
 * refusée à la fin. Une contrainte SYNTAXIQUE ne révèle rien : elle dit qu'un code ne peut
 * pas avoir cette forme, jamais qu'un code existe ou non.
 *
 * ═══ LE PLAFOND, ASSUMÉ ET SIGNALÉ ═══
 * Au-delà de `NP999999`, les codes attribués porteront SEPT chiffres et ce motif les
 * refuserait — un million de membres après le premier. Le jour venu, c'est ici qu'il faudra
 * relâcher la borne (et non l'oublier : le formulaire deviendrait infranchissable).
 */
export const MEMBER_CODE_PATTERN = /^NP\d{6}$/

/**
 * Validation de FORME, étape par étape. Elle ne décide AUCUNE règle métier : elle vérifie ce
 * qu'un formulaire vérifie — un champ obligatoire est rempli, deux mots de passe se
 * ressemblent, un code a la bonne forme.
 *
 * Ce qu'elle ne fait PAS, délibérément :
 *  - dire si un code sponsor EXISTE. C'est le rôle de la vérification de placement (étape 3),
 *    qui interroge le serveur et répond de façon INDISTINCTE ;
 *  - toucher aux codes d'e-card autrement que pour compter les champs non vides — vérifier
 *    un code ici ferait de ce formulaire public l'oracle que D-052 interdit.
 */
export function stepErrors(step: RegisterStep, form: RegistrationForm): string[] {
  const errors: string[] = []

  if (step === "sponsor") {
    if (!MEMBER_CODE_PATTERN.test(form.sponsorCode.trim())) errors.push("sponsorCode")
  }

  if (step === "identity") {
    if (form.lastName.trim().length === 0) errors.push("lastName")
    if (form.firstName.trim().length === 0) errors.push("firstName")
    // « au moins l'un des deux » est une contrainte du backend (un membre doit rester
    // joignable) : on la reflète pour éviter un aller-retour, le serveur reste juge.
    if (form.email.trim().length === 0 && form.phone.trim().length === 0) {
      errors.push("contact")
    }
    if (form.idDocumentNumber.trim().length === 0) errors.push("idDocumentNumber")
    if (form.password.length < 8) errors.push("password")
    if (form.password !== form.passwordConfirm) errors.push("passwordConfirm")
  }

  if (step === "placement") {
    if (!MEMBER_CODE_PATTERN.test(form.uplineCode.trim())) errors.push("uplineCode")
    if (form.leg === "") errors.push("leg")
  }

  if (step === "payment") {
    if (form.ecardCodes.every((code) => code.trim().length === 0)) errors.push("ecardCodes")
    if (!form.termsAccepted) errors.push("terms")
  }

  return errors
}

/**
 * Vérification PRÉALABLE du parrainage, à la sortie de l'étape 3 (D-061).
 *
 * ═══ CE QU'ELLE ÉVITE ═══
 * Sans elle, un code sponsor erroné ne se découvrait qu'à l'étape 4, après avoir saisi ses
 * codes d'e-card et relu un récapitulatif. C'est le pire moment : l'affilié a l'impression
 * d'avoir tout perdu et ne sait pas par où reprendre.
 *
 * ═══ CE QU'ELLE NE DIT PAS ═══
 * Le serveur répond OUI ou NON, jamais POURQUOI. On affiche donc SON message, sans chercher à
 * l'interpréter : sponsor inconnu, upline inconnu, upline hors réseau ou position occupée
 * sont indistinguables, et c'est délibéré — cette route est publique.
 *
 * ═══ CE QU'ELLE NE FAIT PAS ═══
 * Elle ne RÉSERVE rien. La position peut être prise entre cette vérification et la
 * soumission, qui reste seule juge. Un « oui » ici ne promet donc pas un « oui » à la fin.
 *
 * ═══ ET SURTOUT : AUCUN CODE D'E-CARD N'Y PASSE ═══
 * Le corps n'accepte que les trois valeurs de placement. Étendre cette route aux e-cards
 * ferait exactement l'oracle sur la valeur au porteur que D-052 interdit.
 */
export async function checkPlacement(form: RegistrationForm): Promise<void> {
  await unwrap(
    await apiClient.POST("/members/register/check-placement", {
      body: {
        sponsorCode: form.sponsorCode.trim(),
        uplineCode: form.uplineCode.trim(),
        leg: form.leg as "LEFT" | "RIGHT",
      },
    }),
  )
}

/**
 * `useStepper` a déménagé dans `components/common/stepper.tsx`, auprès du composant qu'il
 * pilote : la boutique en a besoin elle aussi, et l'importer d'ici aurait fait dépendre le
 * parcours d'achat du module d'inscription. Réexporté pour que les écrans de ce dossier
 * gardent un seul point d'entrée.
 */
export { useStepper } from "@/components/common/use-stepper"
