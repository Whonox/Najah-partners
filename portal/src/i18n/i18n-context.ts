import { createContext } from "react"
import type { Dictionary, TranslationKey } from "./fr"

/** Langues prévues. `ar` viendra avec son dictionnaire et son sens d'écriture (RTL). */
export type Locale = "fr" | "ar"

export interface I18nContextValue {
  locale: Locale
  dir: "ltr" | "rtl"
  /**
   * Traduit une clé. Le type des clés vient du dictionnaire : une clé inconnue ne compile pas.
   *
   * `vars` remplace les marqueurs `{nom}` du libellé. Un libellé qui doit porter une donnée
   * (« Recentrer l'arbre sur NP000042 ») ne peut pas être fabriqué par concaténation : l'ordre
   * des mots change d'une langue à l'autre, et l'arabe est déjà prévu.
   */
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

export const DICTIONARY_DIRECTION: Record<Locale, "ltr" | "rtl"> = {
  fr: "ltr",
  ar: "rtl",
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export type { Dictionary, TranslationKey }
