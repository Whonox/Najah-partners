import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { IdentityDocumentService } from '../identity-document.service';
import {
  InvalidPinError,
  InvalidSecurityAnswersError,
  OnboardingAlreadyCompletedError,
} from './onboarding.errors';
import { isTrivialPin, PIN_PATTERN } from './pin';
import {
  isSecurityQuestionKey,
  MIN_NORMALIZED_ANSWER_LENGTH,
  normalizeSecurityAnswer,
  REQUIRED_SECURITY_ANSWERS,
} from './security-questions';

const DEFAULT_BCRYPT_ROUNDS = 10;

/** État des trois étapes, tel que le portail le lit pour savoir où reprendre. */
export interface OnboardingStatus {
  idDocumentUploaded: boolean;
  securityQuestionsSet: boolean;
  pinSet: boolean;
  completed: boolean;
  /** Rappelés à l'écran : ils ont été SAISIS à l'inscription, l'image arrive maintenant (D-050). */
  idDocumentType: string | null;
  idDocumentNumber: string | null;
  /** Informatif : la vérification par l'admin ne bloque RIEN (D-018). */
  verificationStatus: string;
}

/**
 * Parcours de première connexion (D-050, D-057) : dépôt de la pièce d'identité, trois
 * questions secrètes, création du PIN.
 *
 * ═══ CE QUI EST BLOQUANT, ET CE QUI NE L'EST PAS ═══
 * Le PARCOURS est bloquant : tant que les trois étapes ne sont pas faites, `OnboardingGuard`
 * ferme le portail (D-057). La VÉRIFICATION par l'admin ne l'est pas et ne l'a jamais été
 * (D-018) : une fois son image déposée, le membre entre, achète, s'active et perçoit sans
 * attendre le moindre verdict. Confondre les deux transformerait une vérification informative
 * en autorisation d'exercer — ce n'est pas la décision qui a été prise.
 *
 * ═══ LES TROIS ÉTAPES SONT INDÉPENDANTES ═══
 * Aucun ordre n'est imposé ici. L'écran les présente en 1-2-3 parce qu'un parcours guidé se
 * lit mieux, mais le service accepte n'importe quel ordre : imposer une séquence côté serveur
 * n'apporterait aucune garantie (les trois sont exigées de toute façon) et interdirait de
 * reprendre un parcours interrompu par là où c'est le plus commode.
 *
 * ═══ CE QUI N'EXISTE NULLE PART EN CLAIR ═══
 * Ni le PIN, ni les réponses secrètes. Ils sont hachés (bcrypt, comme les mots de passe) et
 * n'apparaissent dans aucun log, aucun message d'erreur, aucune ligne d'`AuditLog`.
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly documents: IdentityDocumentService,
  ) {}

  private bcryptRounds(): number {
    const configured = Number(this.config.get<string>('BCRYPT_ROUNDS'));
    return Number.isInteger(configured) && configured > 0
      ? configured
      : DEFAULT_BCRYPT_ROUNDS;
  }

  /** Où en est le membre. Lu à chaque ouverture du parcours pour savoir où le reprendre. */
  async status(memberId: number): Promise<OnboardingStatus> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: {
        idDocumentPath: true,
        idDocumentType: true,
        idDocumentNumber: true,
        pinHash: true,
        onboardingCompletedAt: true,
        verificationStatus: true,
        _count: { select: { securityAnswers: true } },
      },
    });
    if (!member) throw new NotFoundException('Membre introuvable.');

    return {
      idDocumentUploaded: member.idDocumentPath !== null,
      securityQuestionsSet:
        member._count.securityAnswers >= REQUIRED_SECURITY_ANSWERS,
      pinSet: member.pinHash !== null,
      completed: member.onboardingCompletedAt !== null,
      idDocumentType: member.idDocumentType,
      idDocumentNumber: member.idDocumentNumber,
      verificationStatus: member.verificationStatus,
    };
  }

  /**
   * Étape 1 — dépôt de l'image de la pièce (D-050, D-060).
   *
   * Le fichier est écrit AVANT la mise à jour (la colonne a besoin de son chemin), et
   * l'ANCIEN n'est supprimé qu'APRÈS le commit : dans l'autre sens, une transaction échouée
   * laisserait la ligne pointant vers un fichier détruit — le membre aurait « déposé » une
   * pièce que plus personne ne peut lire, et l'admin ne pourrait plus la vérifier.
   */
  async uploadIdDocument(
    memberId: number,
    file: { buffer: Buffer; size: number; originalname?: string },
  ): Promise<OnboardingStatus> {
    const current = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { idDocumentPath: true },
    });
    if (!current) throw new NotFoundException('Membre introuvable.');

    const stored = await this.documents.store(file);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.member.update({
          where: { id: memberId },
          data: { idDocumentPath: stored.relativePath },
        });
        await this.refreshCompletion(tx, memberId);
      });
    } catch (error) {
      await this.documents.discard(stored.relativePath);
      throw error;
    }

    // Le remplacement a réussi : l'ancienne image n'a plus de référence. L'échec du nettoyage
    // n'est pas une erreur pour le membre — au pire un fichier orphelin, jamais une donnée
    // perdue : on trace et on continue.
    if (current.idDocumentPath) {
      await this.documents
        .discard(current.idDocumentPath)
        .catch((error: unknown) =>
          this.logger.warn(
            `Ancienne pièce d'identité non supprimée (membre ${memberId}) : ${String(error)}`,
          ),
        );
    }

    return this.status(memberId);
  }

  /**
   * Étape 2 — les trois questions secrètes (D-050).
   *
   * Non rejouable une fois le parcours terminé : changer ses questions après coup, c'est
   * changer le recours qui permet de réinitialiser son PIN — cela doit passer par une
   * seconde authentification, pas par l'écran d'accueil. Tant que le parcours est en cours,
   * en revanche, le lot est remplaçable : un membre qui se ravise avant d'avoir fini n'a
   * encore rien à protéger.
   */
  async setSecurityQuestions(
    memberId: number,
    answers: Array<{ questionKey: string; answer: string }>,
  ): Promise<OnboardingStatus> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { onboardingCompletedAt: true },
    });
    if (!member) throw new NotFoundException('Membre introuvable.');
    if (member.onboardingCompletedAt !== null) {
      throw new OnboardingAlreadyCompletedError('questions');
    }

    if (answers.length !== REQUIRED_SECURITY_ANSWERS) {
      throw new InvalidSecurityAnswersError('count');
    }

    const keys = answers.map((a) => a.questionKey);
    if (new Set(keys).size !== keys.length) {
      throw new InvalidSecurityAnswersError('duplicate');
    }
    if (!keys.every(isSecurityQuestionKey)) {
      throw new InvalidSecurityAnswersError('unknown-key');
    }

    // La longueur se contrôle sur la forme NORMALISÉE : sinon trois espaces, une fois
    // normalisés en chaîne vide, passeraient le contrôle et deviendraient un secret vide.
    const normalized = answers.map((a) => ({
      questionKey: a.questionKey,
      value: normalizeSecurityAnswer(a.answer),
    }));
    if (normalized.some((a) => a.value.length < MIN_NORMALIZED_ANSWER_LENGTH)) {
      throw new InvalidSecurityAnswersError('answer-too-short');
    }

    const rounds = this.bcryptRounds();
    const hashed = await Promise.all(
      normalized.map(async (a) => ({
        questionKey: a.questionKey,
        answerHash: await bcrypt.hash(a.value, rounds),
      })),
    );

    await this.prisma.$transaction(async (tx) => {
      // Remplacement complet : trois réponses partielles laissées d'un essai précédent
      // rendraient le tirage aléatoire de la seconde auth incohérent.
      await tx.memberSecurityAnswer.deleteMany({ where: { memberId } });
      await tx.memberSecurityAnswer.createMany({
        data: hashed.map((h) => ({ memberId, ...h })),
      });
      await this.refreshCompletion(tx, memberId);
    });

    return this.status(memberId);
  }

  /**
   * Étape 3 — création du PIN (D-050).
   *
   * Non rejouable une fois le parcours terminé : le changement de PIN passe par le profil,
   * derrière une seconde authentification, et l'oubli par la réinitialisation via les
   * questions secrètes. Laisser cette route ouverte donnerait un chemin de remplacement du
   * PIN sans aucune vérification — exactement ce que la seconde auth est censée empêcher.
   */
  async setPin(memberId: number, pin: string): Promise<OnboardingStatus> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { onboardingCompletedAt: true },
    });
    if (!member) throw new NotFoundException('Membre introuvable.');
    if (member.onboardingCompletedAt !== null) {
      throw new OnboardingAlreadyCompletedError('pin');
    }

    if (!PIN_PATTERN.test(pin)) throw new InvalidPinError('format');
    if (isTrivialPin(pin)) throw new InvalidPinError('trivial');

    const pinHash = await bcrypt.hash(pin, this.bcryptRounds());

    await this.prisma.$transaction(async (tx) => {
      await tx.member.update({ where: { id: memberId }, data: { pinHash } });
      await this.refreshCompletion(tx, memberId);
    });

    return this.status(memberId);
  }

  /**
   * Pose `onboardingCompletedAt` dès que les TROIS étapes sont faites — dans la MÊME
   * transaction que l'étape qui vient de les compléter (D-057).
   *
   * L'`UPDATE` est GARDÉ par `onboardingCompletedAt: null` : deux étapes finales soumises en
   * même temps (le membre valide deux fois, ou deux onglets) ne peuvent pas écrire deux
   * horodatages différents — la première gagne, la seconde ne touche aucune ligne. Sans cette
   * garde, la date d'entrée dans le portail serait celle du dernier appel arrivé, pas celle
   * du moment où le parcours a réellement été complété.
   */
  private async refreshCompletion(
    tx: Prisma.TransactionClient,
    memberId: number,
  ): Promise<void> {
    const member = await tx.member.findUnique({
      where: { id: memberId },
      select: {
        idDocumentPath: true,
        pinHash: true,
        onboardingCompletedAt: true,
        _count: { select: { securityAnswers: true } },
      },
    });
    if (!member || member.onboardingCompletedAt !== null) return;

    const complete =
      member.idDocumentPath !== null &&
      member.pinHash !== null &&
      member._count.securityAnswers >= REQUIRED_SECURITY_ANSWERS;
    if (!complete) return;

    await tx.member.updateMany({
      where: { id: memberId, onboardingCompletedAt: null },
      data: { onboardingCompletedAt: new Date() },
    });
  }
}
