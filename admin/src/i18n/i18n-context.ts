import { createContext } from "react"
import type { Dictionary, TranslationKey } from "./fr"

/** Langues prévues. `ar` viendra avec son dictionnaire et son sens d'écriture (RTL). */
export type Locale = "fr" | "ar"

export interface I18nContextValue {
  locale: Locale
  dir: "ltr" | "rtl"
  /** Traduit une clé. Le type des clés vient du dictionnaire : une clé inconnue ne compile pas. */
  t: (key: TranslationKey) => string
}

export const DICTIONARY_DIRECTION: Record<Locale, "ltr" | "rtl"> = {
  fr: "ltr",
  ar: "rtl",
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export type { Dictionary, TranslationKey }
