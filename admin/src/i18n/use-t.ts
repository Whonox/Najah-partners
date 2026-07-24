import { useContext } from "react"
import { I18nContext } from "./i18n-context"

/** Traducteur du composant courant : `const t = useT()` puis `t("nav.members")`. */
export function useT() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error("useT doit être utilisé dans un <I18nProvider>")
  }
  return context.t
}

/** Locale et sens d'écriture courants (utile pour un composant qui doit s'adapter au RTL). */
export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error("useI18n doit être utilisé dans un <I18nProvider>")
  }
  return context
}
