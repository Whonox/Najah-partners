import { useState } from "react"
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
 * Validation de FORME, étape par étape. Elle ne décide AUCUNE règle métier : elle vérifie ce
 * qu'un formulaire vérifie — un champ obligatoire est rempli, deux mots de passe se
 * ressemblent, un code a la forme `NP…`.
 *
 * Ce qu'elle ne fait PAS, délibérément :
 *  - dire si un code sponsor EXISTE (le backend seul le sait) ;
 *  - dire si une position est libre (idem, et c'est une course : elle peut se prendre entre
 *    la vérification et l'envoi) ;
 *  - toucher aux codes d'e-card autrement que pour compter les champs non vides — vérifier
 *    un code ici ferait de ce formulaire public l'oracle que D-052 interdit.
 */
export function stepErrors(step: RegisterStep, form: RegistrationForm): string[] {
  const errors: string[] = []

  if (step === "sponsor") {
    if (!/^NP\d+$/.test(form.sponsorCode.trim())) errors.push("sponsorCode")
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
    if (!/^NP\d+$/.test(form.uplineCode.trim())) errors.push("uplineCode")
    if (form.leg === "") errors.push("leg")
  }

  if (step === "payment") {
    if (form.ecardCodes.every((code) => code.trim().length === 0)) errors.push("ecardCodes")
    if (!form.termsAccepted) errors.push("terms")
  }

  return errors
}

/** Petit état de navigation entre étapes, sans dépendance au routeur. */
export function useStepper(total: number) {
  const [current, setCurrent] = useState(0)
  return {
    current,
    isLast: current === total - 1,
    next: () => setCurrent((c) => Math.min(total - 1, c + 1)),
    back: () => setCurrent((c) => Math.max(0, c - 1)),
    goTo: (index: number) => setCurrent(Math.max(0, Math.min(total - 1, index))),
  }
}
