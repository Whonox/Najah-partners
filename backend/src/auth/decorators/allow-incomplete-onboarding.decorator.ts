import { SetMetadata } from '@nestjs/common';

export const ALLOW_INCOMPLETE_ONBOARDING_KEY = 'allowIncompleteOnboarding';

/**
 * Exclut une route du blocage de première connexion (D-050, D-057).
 *
 * Le parcours d'accueil ferme le portail tant que ses trois étapes ne sont pas faites. Trois
 * familles de routes DOIVENT rester ouvertes, sans quoi le membre serait enfermé dehors :
 *  - le parcours lui-même (sinon il ne pourrait jamais le terminer) ;
 *  - de quoi savoir QUI il est et où il en est (son identité minimale, l'état des étapes) ;
 *  - la déconnexion.
 *
 * À n'apposer nulle part ailleurs. Ce décorateur est le seul chemin d'exemption : une route
 * qu'on oublie de marquer se ferme (défaut sûr), là où l'inverse — une liste de routes
 * bloquées — laisserait passer tout ce qu'on oublie d'y inscrire.
 */
export const AllowIncompleteOnboarding = () =>
  SetMetadata(ALLOW_INCOMPLETE_ONBOARDING_KEY, true);
