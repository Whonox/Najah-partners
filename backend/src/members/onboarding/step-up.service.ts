import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { InvalidPinError } from './onboarding.errors';
import { isTrivialPin, PIN_PATTERN } from './pin';
import {
  ANSWERS_REQUIRED_FOR_PIN_RESET,
  normalizeSecurityAnswer,
} from './security-questions';
import { StepUpRefusedError } from './step-up.errors';

/**
 * ═══ SEUILS (D-058) ═══
 * Cinq essais CUMULÉS toutes voies confondues, puis quinze minutes de blocage. Le jeton
 * obtenu vaut dix minutes : assez pour composer un panier et payer, assez court pour qu'un
 * poste laissé ouvert ne reste pas une session d'argent.
 */
export const MAX_STEP_UP_ATTEMPTS = 5;
export const STEP_UP_LOCK_MS = 15 * 60 * 1000;
export const STEP_UP_TOKEN_TTL_MS = 10 * 60 * 1000;
/** Durée de vie d'un défi de question : le temps de lire et de répondre, pas davantage. */
export const STEP_UP_CHALLENGE_TTL_MS = 2 * 60 * 1000;

const DEFAULT_BCRYPT_ROUNDS = 10;

/**
 * Hash bcrypt factice, comparé lorsque le secret visé n'existe pas (membre sans PIN, question
 * qu'il n'a pas choisie). Sans lui, le temps de réponse trahirait l'information exacte que le
 * message d'erreur indistinct s'applique à cacher : une réponse immédiate signifierait
 * « ce secret n'existe pas », une réponse lente « il existe, mais vous vous êtes trompé ».
 * Même valeur et même raison que `DUMMY_HASH` dans `AuthService`.
 */
const DUMMY_HASH =
  '$2a$10$CwTycUXWue0Thq9StjUM0uJ8i0zLZ3aB0q4o8s3Q7bXxY7m2p6Vi';

export type StepUpMethod = 'PIN' | 'QUESTION';

interface ChallengePayload {
  sub: number;
  typ: 'STEP_UP_CHALLENGE';
  questionKey: string;
}

interface StepUpTokenPayload {
  sub: number;
  typ: 'STEP_UP';
}

/**
 * Seconde authentification des opérations sensibles (D-051, D-058).
 *
 * ═══ DEUX VOIES ÉQUIVALENTES, UN SEUL COMPTEUR ═══
 * Le membre choisit son PIN ou une question secrète — les deux valent la même chose. Mais le
 * compteur d'essais est COMMUN : c'est le cœur de la décision. Deux compteurs séparés
 * doubleraient mécaniquement la surface d'attaque d'un PIN à quatre chiffres — l'attaquant
 * épuiserait l'un, puis passerait à l'autre sans jamais déclencher de blocage.
 *
 * ═══ LE COMPTEUR EST DÉBITÉ AVANT LA VÉRIFICATION ═══
 * L'incrément a lieu AVANT la comparaison bcrypt, en une seule instruction atomique, et il
 * est remis à zéro au succès. Dans l'ordre inverse — lire, comparer, incrémenter — cent
 * requêtes simultanées liraient toutes « 0 essai » et passeraient toutes la garde avant que
 * le premier incrément n'atterrisse : le plafond de cinq ne tiendrait pas une rafale. Débiter
 * d'abord coûte un incrément inutile quand le membre réussit du premier coup ; c'est le bon
 * prix.
 *
 * ═══ LA QUESTION EST TIRÉE PAR LE SERVEUR, ET LIÉE AU DÉFI ═══
 * `challenge()` tire une question au hasard parmi les trois et rend un jeton signé qui la
 * porte. `verify()` n'accepte QUE la question de ce jeton : sans ce lien, le tirage serait
 * décoratif — le client répondrait à celle de son choix.
 *
 * ═══ CE QUI NE SORT JAMAIS ═══
 * Aucun message ne dit quelle voie a échoué, ni combien d'essais restent, ni si le compte est
 * bloqué (voir `StepUpRefusedError`). La distinction existe, mais dans l'`AuditLog` — pour le
 * support, jamais pour l'appelant.
 */
@Injectable()
export class StepUpService {
  private readonly logger = new Logger(StepUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private bcryptRounds(): number {
    const configured = Number(this.config.get<string>('BCRYPT_ROUNDS'));
    return Number.isInteger(configured) && configured > 0
      ? configured
      : DEFAULT_BCRYPT_ROUNDS;
  }

  /**
   * Secret de signature des jetons de seconde authentification.
   *
   * DISTINCT de `JWT_ACCESS_SECRET`, et ce n'est pas de la coquetterie : avec un secret
   * partagé, un jeton de seconde auth — qui porte lui aussi un `sub` — serait accepté par la
   * stratégie d'accès, et deviendrait un jeton de session. Deux usages, deux secrets.
   * À défaut de configuration, on DÉRIVE du secret d'accès plutôt que d'échouer au démarrage :
   * un déploiement existant ne doit pas tomber parce qu'une variable a été ajoutée.
   */
  private stepUpSecret(): string {
    const configured = this.config.get<string>('JWT_STEP_UP_SECRET');
    if (configured && configured.length > 0) return configured;
    return `step-up:${this.config.getOrThrow<string>('JWT_ACCESS_SECRET')}`;
  }

  private sign(payload: object, ttlMs: number): string {
    return this.jwt.sign(payload, {
      secret: this.stepUpSecret(),
      expiresIn: Math.floor(ttlMs / 1000),
    } as unknown as JwtSignOptions);
  }

  /**
   * Tire UNE question au hasard parmi les trois du membre et la lie à un jeton de défi.
   *
   * Le tirage est fait avec `randomInt` (générateur cryptographique) et non `Math.random` :
   * un tirage prédictible laisserait un attaquant attendre la question dont il connaît la
   * réponse plutôt que de la subir.
   */
  async challenge(
    memberId: number,
  ): Promise<{ questionKey: string; challengeToken: string; expiresAt: Date }> {
    const answers = await this.prisma.memberSecurityAnswer.findMany({
      where: { memberId },
      select: { questionKey: true },
    });
    if (answers.length === 0) {
      // Ne devrait pas arriver : le parcours d'accueil est bloquant (D-057) et exige les trois
      // réponses. Si cela se produit, c'est une donnée incohérente — pas la faute de l'appelant.
      throw new StepUpRefusedError();
    }

    const picked = answers[randomInt(answers.length)].questionKey;
    return {
      questionKey: picked,
      challengeToken: this.sign(
        { sub: memberId, typ: 'STEP_UP_CHALLENGE', questionKey: picked },
        STEP_UP_CHALLENGE_TTL_MS,
      ),
      expiresAt: new Date(Date.now() + STEP_UP_CHALLENGE_TTL_MS),
    };
  }

  /**
   * Vérifie le PIN ou la réponse à la question du défi, et rend un jeton de seconde
   * authentification valable 10 minutes.
   */
  async verify(
    memberId: number,
    input:
      | { method: 'PIN'; pin: string }
      | { method: 'QUESTION'; challengeToken: string; answer: string },
  ): Promise<{ stepUpToken: string; expiresAt: Date }> {
    const attempt = await this.debitAttempt(memberId);
    if (attempt === 'LOCKED') {
      await this.trace(memberId, 'STEP_UP_BLOCKED', input.method);
      throw new StepUpRefusedError();
    }

    const ok =
      input.method === 'PIN'
        ? await this.checkPin(memberId, input.pin)
        : await this.checkAnswer(memberId, input.challengeToken, input.answer);

    if (!ok) {
      if (attempt.attempts >= MAX_STEP_UP_ATTEMPTS) {
        await this.lock(memberId);
        await this.trace(memberId, 'STEP_UP_LOCKED', input.method);
      } else {
        await this.trace(memberId, 'STEP_UP_FAILED', input.method);
      }
      throw new StepUpRefusedError();
    }

    await this.reset(memberId);
    return {
      stepUpToken: this.sign(
        { sub: memberId, typ: 'STEP_UP' },
        STEP_UP_TOKEN_TTL_MS,
      ),
      expiresAt: new Date(Date.now() + STEP_UP_TOKEN_TTL_MS),
    };
  }

  /**
   * Vérifie un jeton de seconde authentification (appelé par le garde).
   *
   * Le `sub` est comparé au membre de la requête : un jeton valide obtenu par un compte ne
   * peut pas servir à en couvrir un autre.
   */
  isTokenValidFor(token: string, memberId: number): boolean {
    try {
      const payload = this.jwt.verify<StepUpTokenPayload>(token, {
        secret: this.stepUpSecret(),
      });
      return payload.typ === 'STEP_UP' && payload.sub === memberId;
    } catch {
      return false;
    }
  }

  /**
   * Réinitialisation d'un PIN oublié — le SEUL recours possible : aucun canal e-mail ni SMS
   * n'existe (D-011).
   *
   * Deux bonnes réponses sur trois (D-058), et le MÊME compteur commun : sans cela, cette
   * route deviendrait un contournement du blocage — on épuiserait le PIN, puis on tâtonnerait
   * ici sans limite. Une seule tentative est débitée pour le lot : le membre répond à deux
   * questions en un geste, ce n'est pas deux essais.
   */
  async resetPin(
    memberId: number,
    answers: Array<{ questionKey: string; answer: string }>,
    newPin: string,
  ): Promise<{ success: true }> {
    // Le format du PIN est contrôlé AVANT de débiter un essai : se voir refuser « 1234 » ne
    // doit pas consommer une tentative, ce n'est pas un échec de vérification.
    if (!PIN_PATTERN.test(newPin)) throw new InvalidPinError('format');
    if (isTrivialPin(newPin)) throw new InvalidPinError('trivial');

    const attempt = await this.debitAttempt(memberId);
    if (attempt === 'LOCKED') {
      await this.trace(memberId, 'STEP_UP_BLOCKED', 'PIN_RESET');
      throw new StepUpRefusedError();
    }

    const stored = await this.prisma.memberSecurityAnswer.findMany({
      where: { memberId },
      select: { questionKey: true, answerHash: true },
    });

    // Les clés en double sont écartées AVANT le comptage : répondre trois fois à la même
    // question compterait sinon pour trois bonnes réponses.
    const seen = new Set<string>();
    let correct = 0;
    for (const given of answers) {
      if (seen.has(given.questionKey)) continue;
      seen.add(given.questionKey);
      const row = stored.find((s) => s.questionKey === given.questionKey);
      const matches = await bcrypt.compare(
        normalizeSecurityAnswer(given.answer),
        row?.answerHash ?? DUMMY_HASH,
      );
      if (row && matches) correct += 1;
    }

    if (correct < ANSWERS_REQUIRED_FOR_PIN_RESET) {
      if (attempt.attempts >= MAX_STEP_UP_ATTEMPTS) {
        await this.lock(memberId);
        await this.trace(memberId, 'STEP_UP_LOCKED', 'PIN_RESET');
      } else {
        await this.trace(memberId, 'STEP_UP_FAILED', 'PIN_RESET');
      }
      throw new StepUpRefusedError();
    }

    const pinHash = await bcrypt.hash(newPin, this.bcryptRounds());
    await this.prisma.member.update({
      where: { id: memberId },
      data: {
        pinHash,
        stepUpFailedCount: 0,
        stepUpLockedUntil: null,
      },
    });
    await this.trace(memberId, 'STEP_UP_PIN_RESET', 'PIN_RESET');
    return { success: true };
  }

  // ─────────────────────────── Interne ───────────────────────────

  /**
   * Incrémente le compteur commun EN UNE INSTRUCTION et rend l'état résultant, ou `'LOCKED'`
   * si le blocage court encore. Un blocage échu est levé au passage : il ne dure pas plus
   * longtemps que prévu du seul fait que personne n'est repassé.
   */
  private async debitAttempt(
    memberId: number,
  ): Promise<{ attempts: number } | 'LOCKED'> {
    const now = new Date();
    const member = await this.prisma.member.update({
      where: { id: memberId },
      data: { stepUpFailedCount: { increment: 1 } },
      select: { stepUpFailedCount: true, stepUpLockedUntil: true },
    });

    if (member.stepUpLockedUntil && member.stepUpLockedUntil > now) {
      return 'LOCKED';
    }

    if (member.stepUpLockedUntil) {
      // Blocage échu : la tentative courante ouvre une nouvelle série.
      await this.prisma.member.update({
        where: { id: memberId },
        data: { stepUpFailedCount: 1, stepUpLockedUntil: null },
      });
      return { attempts: 1 };
    }

    // Rafale concurrente : plusieurs requêtes ont débité en même temps et dépassent le
    // plafond. Elles sont refusées et le blocage est posé — c'est précisément ce que le
    // débit préalable permet de rattraper.
    if (member.stepUpFailedCount > MAX_STEP_UP_ATTEMPTS) {
      await this.lock(memberId);
      return 'LOCKED';
    }

    return { attempts: member.stepUpFailedCount };
  }

  private async lock(memberId: number): Promise<void> {
    await this.prisma.member.update({
      where: { id: memberId },
      data: {
        stepUpFailedCount: 0,
        stepUpLockedUntil: new Date(Date.now() + STEP_UP_LOCK_MS),
      },
    });
  }

  private async reset(memberId: number): Promise<void> {
    await this.prisma.member.update({
      where: { id: memberId },
      data: { stepUpFailedCount: 0, stepUpLockedUntil: null },
    });
  }

  private async checkPin(memberId: number, pin: string): Promise<boolean> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { pinHash: true },
    });
    return bcrypt.compare(pin, member?.pinHash ?? DUMMY_HASH);
  }

  private async checkAnswer(
    memberId: number,
    challengeToken: string,
    answer: string,
  ): Promise<boolean> {
    let payload: ChallengePayload;
    try {
      payload = this.jwt.verify<ChallengePayload>(challengeToken, {
        secret: this.stepUpSecret(),
      });
    } catch {
      // Défi expiré ou forgé. On compare tout de même contre le hash factice : sans cela, un
      // jeton invalide répondrait instantanément là où un mauvais mot répond en ~100 ms, et
      // le message indistinct redeviendrait distinguable au chronomètre.
      await bcrypt.compare(answer, DUMMY_HASH);
      return false;
    }

    if (payload.typ !== 'STEP_UP_CHALLENGE' || payload.sub !== memberId) {
      await bcrypt.compare(answer, DUMMY_HASH);
      return false;
    }

    const row = await this.prisma.memberSecurityAnswer.findFirst({
      where: { memberId, questionKey: payload.questionKey },
      select: { answerHash: true },
    });
    return bcrypt.compare(
      normalizeSecurityAnswer(answer),
      row?.answerHash ?? DUMMY_HASH,
    );
  }

  /**
   * Trace l'échec côté serveur — c'est LÀ que vit la distinction que la réponse HTTP refuse
   * de donner : quelle voie a été tentée, et si le compte a basculé en blocage.
   *
   * Ce qui n'y figure jamais : le PIN saisi, la réponse saisie, le hash visé. Un journal
   * d'audit se relit des mois plus tard, par des gens qui n'ont pas à connaître des secrets.
   * L'écriture ne doit jamais faire échouer la vérification elle-même — on trace et on
   * continue.
   */
  private async trace(
    memberId: number,
    action: string,
    method: StepUpMethod | 'PIN_RESET',
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actor: `Member:${memberId}`,
          action,
          target: `Member:${memberId}`,
          after: { method },
        },
      });
    } catch (error) {
      this.logger.warn(
        `Trace de seconde authentification non écrite (membre ${memberId}) : ${String(error)}`,
      );
    }
  }
}
