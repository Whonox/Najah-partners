import { SetMetadata } from '@nestjs/common';

export const REQUIRE_STEP_UP_KEY = 'requireStepUp';

/**
 * Exige une seconde authentification récente pour cette route (D-051, D-058).
 *
 * ═══ OÙ L'APPOSER ═══
 * Sur tout ce qui touche à l'argent — et pas seulement sur ce qui le DÉPLACE :
 *  - les MUTATIONS : création et prolongation d'e-card, checkout d'activation, achat libre,
 *    paiement du renouvellement ;
 *  - les LECTURES d'argent : « Mes e-cards », « Mes gains », mes mouvements de solde.
 *
 * Garder les seules mutations aurait fait de « l'accès aux écrans d'argent » (D-051) une
 * barrière d'affichage : la boîte de dialogue s'ouvre à l'écran, et une requête directe à
 * l'API lit les mêmes chiffres sans jamais la rencontrer.
 *
 * ═══ CE QUE CE DÉCORATEUR N'EST PAS ═══
 * Ce n'est pas une autorisation — le membre a déjà le droit de faire ces opérations. C'est
 * une preuve de PRÉSENCE : que la personne devant l'écran est bien celle qui s'est connectée,
 * et non quelqu'un qui a trouvé la session ouverte. D'où sa durée courte (10 minutes) et son
 * indépendance du jeton d'accès.
 *
 * Le contraire du blocage d'accueil (`@AllowIncompleteOnboarding`) : ici le défaut est OUVERT
 * et l'on marque ce qu'on ferme. C'est assumé — étendre la seconde authentification à tout le
 * portail obligerait à saisir un PIN pour consulter son arbre, et un garde-fou qu'on subit
 * toutes les deux minutes finit contourné par ses propres utilisateurs.
 */
export const RequireStepUp = () => SetMetadata(REQUIRE_STEP_UP_KEY, true);

/** En-tête portant le jeton de seconde authentification. */
export const STEP_UP_HEADER = 'x-step-up';
