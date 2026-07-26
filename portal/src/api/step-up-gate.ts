/**
 * Passerelle entre le transport HTTP et la boîte de dialogue de seconde authentification
 * (D-051/D-058).
 *
 * ═══ LE PROBLÈME QU'ELLE RÈGLE ═══
 * Le refus `STEP_UP_REQUIRED` arrive dans la couche `fetch`, qui n'a ni composant, ni
 * routeur, ni moyen d'afficher quoi que ce soit. La réponse — le PIN ou une question secrète
 * — ne peut venir que de l'interface. Il faut donc que le transport puisse DEMANDER, attendre,
 * et rejouer ; sans que chaque écran ait à s'en occuper.
 *
 * L'alternative — laisser chaque écran attraper le 403 et ouvrir son propre dialogue —
 * signifierait le réimplémenter dans « Mes gains », « Mes e-cards », le checkout, le
 * renouvellement… et en oublier un. Ce qu'on oublie ici n'est pas une erreur visible : c'est
 * un écran qui affiche « accès refusé » à un membre parfaitement légitime.
 *
 * ═══ UNE SEULE DEMANDE EN VOL ═══
 * Un écran part avec plusieurs requêtes simultanées ; elles échouent toutes en même temps.
 * Sans partage, l'affilié verrait sa boîte de dialogue s'ouvrir trois fois de suite. Toutes
 * attendent donc la MÊME promesse, et rejouent avec le même jeton — exactement le patron déjà
 * retenu pour le rafraîchissement d'access token (D-016b).
 *
 * ═══ ANNULER EST UNE RÉPONSE VALIDE ═══
 * Le membre peut refuser de saisir son PIN. La promesse résout alors `null`, la requête
 * d'origine rend son 403, et l'écran affiche un refus — ce qui est exact : il n'a pas voulu
 * prouver son identité. Rien ne le force, rien ne boucle.
 */

type StepUpRequester = () => Promise<string | null>

let requester: StepUpRequester | null = null
let inFlight: Promise<string | null> | null = null

/**
 * Le fournisseur d'interface s'enregistre ici au montage. Tant que personne ne l'a fait —
 * avant que React ne soit monté — une demande échoue proprement plutôt que d'attendre pour
 * toujours.
 */
export function registerStepUpRequester(fn: StepUpRequester | null): void {
  requester = fn
}

/** Demande une seconde authentification. Rend le jeton obtenu, ou `null` si le membre renonce. */
export function requestStepUp(): Promise<string | null> {
  if (!requester) return Promise.resolve(null)
  inFlight ??= requester().finally(() => {
    inFlight = null
  })
  return inFlight
}
