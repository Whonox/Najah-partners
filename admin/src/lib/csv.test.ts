import { describe, expect, it } from "vitest"
import { toCsv } from "./csv"

/**
 * EXPORT CSV — la seule logique réellement pure du back-office, et la plus sournoise.
 *
 * ═══ POURQUOI CE FICHIER EXISTE, ET POURQUOI IL EST SEUL ═══
 * `admin/` est du CRUD sur des tableaux : la logique vit dans `backend/`, les écrans se
 * vérifient au navigateur. On n'a donc PAS gonflé le nombre de tests ici pour faire nombre —
 * on a testé ce qui se trompe silencieusement.
 *
 * L'export CSV est exactement cela. Un motif d'ajustement contenant un point-virgule décale
 * toutes les colonnes suivantes de la ligne : le fichier s'ouvre sans erreur, le tableur
 * n'affiche aucun avertissement, et un gestionnaire lit un montant en face du mauvais membre.
 * Rien, ni au navigateur ni côté backend, ne rattrape cela.
 */

interface Row {
  code: string
  label: string
  amountDt: string
}

const COLUMNS = [
  { header: "Code", value: (r: Row) => r.code },
  { header: "Libellé", value: (r: Row) => r.label },
  { header: "Montant", value: (r: Row) => r.amountDt },
]

/** Le BOM en tête est indispensable à Excel ; on le retire pour comparer le contenu. */
function lines(csv: string): string[] {
  return csv.replace(/^\uFEFF/, "").split("\r\n")
}

describe("toCsv — structure du fichier", () => {
  it("écrit l'en-tête puis une ligne par enregistrement, séparés par des CRLF", () => {
    const csv = toCsv([{ code: "NP000001", label: "Silver", amountDt: "2100.000" }], COLUMNS)

    expect(lines(csv)).toEqual(["Code;Libellé;Montant", "NP000001;Silver;2100.000"])
  })

  it("commence par un BOM UTF-8 — sans lui Excel affiche « CrÃ©ateur »", () => {
    expect(toCsv([], COLUMNS).charCodeAt(0)).toBe(0xfeff)
  })

  it("sépare par des POINTS-VIRGULES, ce qu'attend Excel en configuration française", () => {
    expect(lines(toCsv([], COLUMNS))[0]).toBe("Code;Libellé;Montant")
  })

  it("un export vide garde son en-tête : un fichier sans colonnes n'est pas un export", () => {
    expect(lines(toCsv([], COLUMNS))).toHaveLength(1)
  })
})

describe("toCsv — échappement : le défaut qui décale les colonnes", () => {
  it("entoure de guillemets une cellule contenant le séparateur", () => {
    // Sans cela, « Ajustement ; erreur de saisie » deviendrait DEUX colonnes et décalerait le
    // montant d'un cran vers la droite, en face du mauvais libellé.
    const csv = toCsv(
      [{ code: "NP000001", label: "Ajustement ; erreur de saisie", amountDt: "10.000" }],
      COLUMNS,
    )

    expect(lines(csv)[1]).toBe('NP000001;"Ajustement ; erreur de saisie";10.000')
  })

  it("double les guillemets internes et entoure la cellule", () => {
    const csv = toCsv(
      [{ code: "NP000001", label: 'Motif "urgent"', amountDt: "10.000" }],
      COLUMNS,
    )

    expect(lines(csv)[1]).toBe('NP000001;"Motif ""urgent""";10.000')
  })

  it("entoure une cellule contenant un saut de ligne", () => {
    const csv = toCsv(
      [{ code: "NP000001", label: "Ligne 1\nLigne 2", amountDt: "10.000" }],
      COLUMNS,
    )

    expect(csv).toContain('"Ligne 1\nLigne 2"')
  })

  it("échappe aussi les EN-TÊTES, pas seulement les cellules", () => {
    // Un libellé de colonne est une chaîne comme une autre : l'oublier décalerait tout le
    // fichier dès la première ligne, ce qui est le pire endroit pour se tromper.
    const csv = toCsv([], [{ header: "Montant ; net", value: () => "" }])

    expect(lines(csv)[0]).toBe('"Montant ; net"')
  })

  it("n'ajoute pas de guillemets quand il n'y en a pas besoin", () => {
    // Des guillemets partout seraient valides mais illisibles à l'ouverture dans un éditeur
    // de texte, ce qui est le premier réflexe quand un export semble faux.
    expect(lines(toCsv([{ code: "NP000001", label: "Silver", amountDt: "1.000" }], COLUMNS))[1])
      .toBe("NP000001;Silver;1.000")
  })

  it("rend une cellule VIDE pour une valeur absente, jamais « null » ni « undefined »", () => {
    const csv = toCsv(
      [{ code: "NP000001", label: "", amountDt: "" }],
      [
        { header: "Code", value: (r: Row) => r.code },
        { header: "Vide", value: () => null },
        { header: "Absent", value: () => undefined },
      ],
    )

    expect(lines(csv)[1]).toBe("NP000001;;")
  })
})

describe("toCsv — les montants sortent BRUTS", () => {
  it("ne reformate jamais un montant à la française", () => {
    // « 2 100,000 » avec espace fine et virgule décimale casse le parsing du tableur : on
    // exporte la valeur exacte reçue de l'API, au millime, sans passer par un flottant.
    const csv = toCsv([{ code: "X", label: "Y", amountDt: "2100.000" }], COLUMNS)

    expect(lines(csv)[1]).toContain("2100.000")
    // Les deux marques du formatage français, écrites en ÉCHAPPEMENT : l'espace fine
    // insécable (U+202F) est indiscernable d'une espace ordinaire dans une source, et une
    // assertion qui viserait la mauvaise des deux passerait sans rien vérifier.
    expect(csv).not.toContain("\u202f")
    expect(csv).not.toContain("2100,000")
  })
})
