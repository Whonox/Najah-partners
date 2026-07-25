import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActorType } from '@prisma/client';
import { OnboardingRequiredError } from '../../members/onboarding/onboarding.errors';
import { PrismaService } from '../../prisma/prisma.service';
import { ALLOW_INCOMPLETE_ONBOARDING_KEY } from '../decorators/allow-incomplete-onboarding.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedActor } from '../auth.types';

/**
 * Blocage du parcours de première connexion (D-050, D-057).
 *
 * ═══ POURQUOI CE GARDE EXISTE ═══
 * Un parcours obligatoire gardé par le seul routage React n'est pas un blocage : il suffit
 * d'appeler l'API directement pour s'en affranchir. La règle vit donc ici — « les trois
 * étapes sont faites » devient un FAIT vérifié à chaque requête, pas une supposition du front.
 *
 * ═══ CE QUI RESTE OUVERT ═══
 * Les routes publiques, les acteurs ADMIN (le parcours ne concerne que les affiliés) et les
 * routes explicitement marquées `@AllowIncompleteOnboarding()` — le parcours lui-même, de quoi
 * savoir qui l'on est, la déconnexion. Tout le reste se ferme PAR DÉFAUT : une route ajoutée
 * demain et qu'on oublierait de classer est fermée, jamais ouverte.
 *
 * ═══ LE COÛT, ASSUMÉ ═══
 * Une lecture par requête membre. L'acteur vient du JWT (`JwtAccessStrategy` ne touche pas la
 * base) : il faut donc relire la colonne. Mettre l'information dans le token l'aurait évitée,
 * mais un access token vit 15 minutes — un membre qui vient de terminer son parcours resterait
 * bloqué jusqu'à son prochain rafraîchissement, et une revendication périmée deviendrait un
 * contournement. Une lecture indexée par clé primaire est le bon prix pour une garantie juste.
 */
@Injectable()
export class OnboardingGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_INCOMPLETE_ONBOARDING_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedActor }>();

    // Pas d'acteur (route sans authentification effective) ou acteur ADMIN : hors sujet.
    // Le back-office n'a pas de parcours d'accueil — c'est une surface d'affiliés.
    if (!user || user.actorType !== ActorType.MEMBER) return true;

    const member = await this.prisma.member.findUnique({
      where: { id: user.id },
      select: { onboardingCompletedAt: true },
    });

    // Membre introuvable : on laisse passer, le contrôleur rendra son 404. Rendre ici un
    // « terminez votre première connexion » à un compte supprimé serait un message faux.
    if (!member) return true;

    if (member.onboardingCompletedAt === null) {
      throw new OnboardingRequiredError();
    }
    return true;
  }
}
