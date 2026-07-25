import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { InvalidPinError } from './onboarding.errors';
import { normalizeSecurityAnswer } from './security-questions';
import { StepUpRefusedError } from './step-up.errors';
import {
  MAX_STEP_UP_ATTEMPTS,
  STEP_UP_LOCK_MS,
  StepUpService,
} from './step-up.service';

/**
 * Ce que ces tests tiennent :
 *  — LE COMPTEUR EST COMMUN aux deux voies (D-058). C'est LA décision de la tranche : deux
 *    compteurs séparés doubleraient la surface d'attaque d'un PIN à quatre chiffres. Le test
 *    « 3 échecs de PIN + 2 échecs de question = blocage » échouerait si quelqu'un les
 *    séparait un jour ;
 *  — le refus est INDISTINCT : même classe d'erreur pour un PIN faux, une réponse fausse, un
 *    défi expiré et un compte bloqué. Aucun message ne dit laquelle des deux voies a échoué,
 *    ni combien d'essais restent ;
 *  — le compteur est débité AVANT la vérification : une rafale concurrente ne peut pas passer
 *    à travers le plafond ;
 *  — la réinitialisation du PIN passe par le MÊME compteur — sinon elle serait le
 *    contournement du blocage ;
 *  — un défi lie la question tirée : on ne peut pas répondre à une autre que celle qui est
 *    tombée, sans quoi le tirage aléatoire serait décoratif.
 */

const PIN = '4827';
const ANSWERS = [
  { questionKey: 'FIRST_SCHOOL', answer: 'Ibn Khaldoun' },
  { questionKey: 'CHILDHOOD_NICKNAME', answer: 'Momo' },
  { questionKey: 'FIRST_PET_NAME', answer: 'Bella' },
];

async function buildMock(overrides: { pin?: string | null } = {}) {
  const rounds = 4;
  const state = {
    stepUpFailedCount: 0,
    stepUpLockedUntil: null as Date | null,
    pinHash:
      overrides.pin === null
        ? null
        : await bcrypt.hash(overrides.pin ?? PIN, rounds),
  };
  const storedAnswers = await Promise.all(
    ANSWERS.map(async (a) => ({
      questionKey: a.questionKey,
      answerHash: await bcrypt.hash(normalizeSecurityAnswer(a.answer), rounds),
    })),
  );

  const audit: Array<{ action: string; method: unknown }> = [];

  const prisma = {
    member: {
      update: jest.fn(
        (args: { data: Record<string, unknown>; select?: unknown }) => {
          const data = args.data;
          if (
            typeof data.stepUpFailedCount === 'object' &&
            data.stepUpFailedCount !== null
          ) {
            state.stepUpFailedCount += (
              data.stepUpFailedCount as { increment: number }
            ).increment;
          } else if (typeof data.stepUpFailedCount === 'number') {
            state.stepUpFailedCount = data.stepUpFailedCount;
          }
          if ('stepUpLockedUntil' in data) {
            state.stepUpLockedUntil = data.stepUpLockedUntil as Date | null;
          }
          if (typeof data.pinHash === 'string') state.pinHash = data.pinHash;
          return Promise.resolve({ ...state });
        },
      ),
      findUnique: jest.fn(() => Promise.resolve({ pinHash: state.pinHash })),
    },
    memberSecurityAnswer: {
      findMany: jest.fn(() => Promise.resolve(storedAnswers)),
      findFirst: jest.fn((args: { where: { questionKey: string } }) =>
        Promise.resolve(
          storedAnswers.find((a) => a.questionKey === args.where.questionKey) ??
            null,
        ),
      ),
    },
    auditLog: {
      create: jest.fn((args: { data: { action: string; after: unknown } }) => {
        audit.push({
          action: args.data.action,
          method: (args.data.after as { method: string }).method,
        });
        return Promise.resolve({});
      }),
    },
  };

  const service = new StepUpService(
    prisma as unknown as PrismaService,
    new JwtService({}),
    {
      get: (key: string) => (key === 'BCRYPT_ROUNDS' ? '4' : undefined),
      getOrThrow: () => 'test-access-secret',
    } as unknown as ConfigService,
  );

  return { service, state, audit, prisma };
}

async function failWithPin(service: StepUpService) {
  await expect(
    service.verify(1, { method: 'PIN', pin: '9999' }),
  ).rejects.toBeInstanceOf(StepUpRefusedError);
}

async function failWithQuestion(service: StepUpService) {
  const challenge = await service.challenge(1);
  await expect(
    service.verify(1, {
      method: 'QUESTION',
      challengeToken: challenge.challengeToken,
      answer: 'réponse fausse',
    }),
  ).rejects.toBeInstanceOf(StepUpRefusedError);
}

describe('StepUpService — les deux voies', () => {
  it('accepte le bon PIN et rend un jeton', async () => {
    const { service } = await buildMock();
    const result = await service.verify(1, { method: 'PIN', pin: PIN });
    expect(result.stepUpToken).toBeTruthy();
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('accepte la bonne réponse à la question TIRÉE, casse et accents ignorés', async () => {
    const { service } = await buildMock();
    const challenge = await service.challenge(1);
    const expected = ANSWERS.find(
      (a) => a.questionKey === challenge.questionKey,
    )!.answer;

    const result = await service.verify(1, {
      method: 'QUESTION',
      challengeToken: challenge.challengeToken,
      // Même réponse, saisie autrement : c'est tout l'intérêt de la normalisation.
      answer: `  ${expected.toUpperCase()}  `,
    });
    expect(result.stepUpToken).toBeTruthy();
  });

  it('refuse de répondre à une AUTRE question que celle du défi', async () => {
    const { service } = await buildMock();
    const challenge = await service.challenge(1);
    const other = ANSWERS.find((a) => a.questionKey !== challenge.questionKey)!;

    await expect(
      service.verify(1, {
        method: 'QUESTION',
        challengeToken: challenge.challengeToken,
        answer: other.answer, // bonne réponse, mais pas à la question tirée
      }),
    ).rejects.toBeInstanceOf(StepUpRefusedError);
  });

  it('refuse un jeton de défi forgé', async () => {
    const { service } = await buildMock();
    await expect(
      service.verify(1, {
        method: 'QUESTION',
        challengeToken: 'pas.un.jeton',
        answer: 'peu importe',
      }),
    ).rejects.toBeInstanceOf(StepUpRefusedError);
  });

  it('rend le MÊME refus pour un PIN faux et pour une réponse fausse', async () => {
    const { service } = await buildMock();

    const capture = async (
      run: Promise<unknown>,
    ): Promise<StepUpRefusedError> => {
      try {
        await run;
        throw new Error('la vérification aurait dû échouer');
      } catch (error) {
        return error as StepUpRefusedError;
      }
    };

    const pinError = await capture(
      service.verify(1, { method: 'PIN', pin: '9999' }),
    );
    const challenge = await service.challenge(1);
    const answerError = await capture(
      service.verify(1, {
        method: 'QUESTION',
        challengeToken: challenge.challengeToken,
        answer: 'faux',
      }),
    );

    // Rien ne distingue les deux réponses : ni le code, ni le corps. C'est tout l'objet de
    // `StepUpRefusedError` — savoir QUELLE voie a échoué dirait à un attaquant laquelle il
    // lui reste à épuiser.
    expect(pinError.getStatus()).toBe(answerError.getStatus());
    expect(pinError.getResponse()).toEqual(answerError.getResponse());
  });
});

describe('StepUpService — compteur COMMUN aux deux voies (D-058)', () => {
  it('bloque après 3 échecs de PIN PUIS 2 échecs de question — un seul compteur', async () => {
    const { service, state } = await buildMock();

    await failWithPin(service);
    await failWithPin(service);
    await failWithPin(service);
    expect(state.stepUpLockedUntil).toBeNull(); // 3 essais : pas encore

    await failWithQuestion(service);
    await failWithQuestion(service); // 5e essai, toutes voies confondues

    expect(state.stepUpLockedUntil).toBeInstanceOf(Date);
    expect(state.stepUpLockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuse le BON PIN pendant le blocage — épuiser une voie ferme l’autre ET la sienne', async () => {
    const { service, state } = await buildMock();
    for (let i = 0; i < MAX_STEP_UP_ATTEMPTS; i += 1)
      await failWithPin(service);
    expect(state.stepUpLockedUntil).toBeInstanceOf(Date);

    await expect(
      service.verify(1, { method: 'PIN', pin: PIN }),
    ).rejects.toBeInstanceOf(StepUpRefusedError);
  });

  it('remet le compteur à zéro au premier succès', async () => {
    const { service, state } = await buildMock();
    await failWithPin(service);
    await failWithPin(service);

    await service.verify(1, { method: 'PIN', pin: PIN });
    expect(state.stepUpFailedCount).toBe(0);
    expect(state.stepUpLockedUntil).toBeNull();
  });

  it('lève un blocage ÉCHU et repart d’une nouvelle série', async () => {
    const { service, state } = await buildMock();
    state.stepUpLockedUntil = new Date(Date.now() - STEP_UP_LOCK_MS);
    state.stepUpFailedCount = 0;

    await expect(
      service.verify(1, { method: 'PIN', pin: PIN }),
    ).resolves.toHaveProperty('stepUpToken');
  });

  it('refuse une rafale concurrente qui dépasserait le plafond', async () => {
    const { service, state } = await buildMock();
    // Simule des débits déjà encaissés par des requêtes simultanées.
    state.stepUpFailedCount = MAX_STEP_UP_ATTEMPTS;

    await expect(
      service.verify(1, { method: 'PIN', pin: PIN }),
    ).rejects.toBeInstanceOf(StepUpRefusedError);
    expect(state.stepUpLockedUntil).toBeInstanceOf(Date);
  });

  it('demander un défi ne consomme AUCUN essai', async () => {
    const { service, state } = await buildMock();
    await service.challenge(1);
    await service.challenge(1);
    await service.challenge(1);
    expect(state.stepUpFailedCount).toBe(0);
  });
});

describe('StepUpService — jeton', () => {
  it('n’est valable que pour le membre qui l’a obtenu', async () => {
    const { service } = await buildMock();
    const { stepUpToken } = await service.verify(1, {
      method: 'PIN',
      pin: PIN,
    });

    expect(service.isTokenValidFor(stepUpToken, 1)).toBe(true);
    expect(service.isTokenValidFor(stepUpToken, 2)).toBe(false);
  });

  it('rejette un jeton de DÉFI présenté comme jeton de seconde auth', async () => {
    const { service } = await buildMock();
    const challenge = await service.challenge(1);
    // Même secret, même membre — mais pas le même usage : le `typ` les sépare.
    expect(service.isTokenValidFor(challenge.challengeToken, 1)).toBe(false);
  });

  it('rejette n’importe quoi d’autre', async () => {
    const { service } = await buildMock();
    expect(service.isTokenValidFor('', 1)).toBe(false);
    expect(service.isTokenValidFor('bidon', 1)).toBe(false);
  });
});

describe('StepUpService — réinitialisation du PIN (D-058)', () => {
  it('accepte DEUX bonnes réponses sur trois et pose le nouveau PIN', async () => {
    const { service, state } = await buildMock();
    const before = state.pinHash;

    await service.resetPin(1, [ANSWERS[0], ANSWERS[1]], '5931');
    expect(state.pinHash).not.toBe(before);
    await expect(bcrypt.compare('5931', state.pinHash!)).resolves.toBe(true);
  });

  it('refuse une seule bonne réponse', async () => {
    const { service } = await buildMock();
    await expect(
      service.resetPin(
        1,
        [ANSWERS[0], { questionKey: 'CHILDHOOD_NICKNAME', answer: 'faux' }],
        '5931',
      ),
    ).rejects.toBeInstanceOf(StepUpRefusedError);
  });

  it('ne compte pas deux fois la MÊME question', async () => {
    const { service } = await buildMock();
    await expect(
      service.resetPin(1, [ANSWERS[0], ANSWERS[0]], '5931'),
    ).rejects.toBeInstanceOf(StepUpRefusedError);
  });

  it('partage le compteur commun — elle ne contourne pas le blocage', async () => {
    const { service } = await buildMock();
    for (let i = 0; i < MAX_STEP_UP_ATTEMPTS; i += 1)
      await failWithPin(service);

    await expect(
      service.resetPin(1, [ANSWERS[0], ANSWERS[1]], '5931'),
    ).rejects.toBeInstanceOf(StepUpRefusedError);
  });

  it('refuse un PIN trop simple SANS consommer d’essai', async () => {
    const { service, state } = await buildMock();
    await expect(
      service.resetPin(1, [ANSWERS[0], ANSWERS[1]], '1234'),
    ).rejects.toBeInstanceOf(InvalidPinError);
    expect(state.stepUpFailedCount).toBe(0);
  });

  it('remet le compteur à zéro une fois le PIN réinitialisé', async () => {
    const { service, state } = await buildMock();
    await failWithPin(service);
    await failWithPin(service);

    await service.resetPin(1, [ANSWERS[0], ANSWERS[1]], '5931');
    expect(state.stepUpFailedCount).toBe(0);
    expect(state.stepUpLockedUntil).toBeNull();
  });
});

describe('StepUpService — traçabilité', () => {
  it('trace côté serveur la voie tentée — la distinction que la réponse HTTP refuse de donner', async () => {
    const { service, audit } = await buildMock();
    await failWithPin(service);
    await failWithQuestion(service);

    expect(audit).toEqual([
      { action: 'STEP_UP_FAILED', method: 'PIN' },
      { action: 'STEP_UP_FAILED', method: 'QUESTION' },
    ]);
  });

  it('distingue l’échec du BLOCAGE dans le journal', async () => {
    const { service, audit } = await buildMock();
    for (let i = 0; i < MAX_STEP_UP_ATTEMPTS; i += 1)
      await failWithPin(service);
    expect(audit[audit.length - 1].action).toBe('STEP_UP_LOCKED');
  });

  it('n’écrit JAMAIS le secret saisi', async () => {
    const { service, prisma } = await buildMock();
    await failWithPin(service);

    const written = JSON.stringify(prisma.auditLog.create.mock.calls);
    expect(written).not.toContain('9999');
    expect(written).not.toContain(PIN);
  });
});
