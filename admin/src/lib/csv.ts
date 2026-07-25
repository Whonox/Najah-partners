/**
 * Export CSV, écrit CÔTÉ FRONT depuis les données déjà affichées (§7.2.10).
 *
 * Pourquoi pas une route d'export : elle aurait dupliqué chaque requête, chaque filtre et chaque
 * en-tête de colonne, avec la garantie qu'un jour le fichier téléchargé ne dirait plus la même
 * chose que le tableau à l'écran. Ici, ce qu'on exporte est LITTÉRALEMENT ce qu'on voit.
 *
 * Deux précautions qui ne se voient pas mais qui décident du résultat :
 *
 *  1. **Séparateur point-virgule et BOM UTF-8.** Excel en configuration française lit le `;`
 *     comme séparateur de colonnes, et sans BOM il affiche « CrÃ©ateur ». Un export illisible
 *     par le seul tableur que l'admin utilise n'est pas un export.
 *  2. **Les montants sortent en CHAÎNE BRUTE, jamais reformatés.** Un « 2 100,000 » avec espace
 *     fine insécable et virgule décimale casse le parsing du tableur. On exporte donc
 *     « 2100.000 » — la valeur exacte reçue de l'API, au millime, sans passer par un flottant.
 */

const SEPARATOR = ";"
/** Marque d'ordre des octets : c'est elle qui dit à Excel « ce fichier est en UTF-8 ». */
const BOM = "﻿"

export interface CsvColumn<TRow> {
  header: string
  /** Valeur BRUTE de la cellule. Un montant se rend en chaîne décimale (`"2100.000"`). */
  value: (row: TRow) => string | number | null | undefined
}

/**
 * Échappement CSV : guillemets doublés, et cellule entre guillemets dès qu'elle contient un
 * séparateur, un guillemet ou un saut de ligne. Sans cela, un motif d'ajustement contenant un
 * point-virgule décalerait toutes les colonnes suivantes de la ligne.
 */
function escape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""
  const text = String(value)
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv<TRow>(rows: TRow[], columns: CsvColumn<TRow>[]): string {
  const header = columns.map((column) => escape(column.header)).join(SEPARATOR)
  const body = rows.map((row) =>
    columns.map((column) => escape(column.value(row))).join(SEPARATOR),
  )
  // CRLF : la fin de ligne qu'attendent les tableurs sous Windows.
  return BOM + [header, ...body].join("\r\n")
}

/** Déclenche le téléchargement. L'URL d'objet est révoquée : sinon le blob fuit à chaque export. */
export function downloadCsv<TRow>(
  filename: string,
  rows: TRow[],
  columns: CsvColumn<TRow>[],
): void {
  const blob = new Blob([toCsv(rows, columns)], {
    type: "text/csv;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** Suffixe de date pour un nom de fichier : `ventes-2026-07-25.csv`. */
export function csvFilename(base: string): string {
  return `${base}-${new Date().toISOString().slice(0, 10)}.csv`
}
