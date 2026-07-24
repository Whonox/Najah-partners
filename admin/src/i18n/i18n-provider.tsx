import { useEffect, useMemo, type ReactNode } from "react"
import { fr, type Dictionary, type TranslationKey } from "./fr"
import { DICTIONARY_DIRECTION, I18nContext, type Locale } from "./i18n-context"

/**
 * Registre des dictionnaires. Un seul aujourd'hui (FR au lancement) ; l'arabe s'ajoutera ici,
 * et `dir` basculera en RTL tout seul (`DICTIONARY_DIRECTION`).
 */
const DICTIONARIES: Partial<Record<Locale, Dictionary>> = { fr }

export function I18nProvider({
  children,
  locale = "fr",
}: {
  children: ReactNode
  locale?: Locale
}) {
  const dictionary = DICTIONARIES[locale] ?? fr
  const dir = DICTIONARY_DIRECTION[locale]

  // <html lang / dir> : c'est ce couple qui fait basculer toute la mise en page en RTL
  // (les composants shadcn du projet sont initialisés avec `rtl: true`).
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = dir
  }, [locale, dir])

  const value = useMemo(
    () => ({
      locale,
      dir,
      t: (key: TranslationKey) => dictionary[key] ?? key,
    }),
    [locale, dir, dictionary],
  )

  return <I18nContext value={value}>{children}</I18nContext>
}
