import { ConfigService } from '@nestjs/config';
import { VerificationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IdentityDocumentService } from '../identity-document.service';
import {
  InvalidPinError,
  InvalidSecurityAnswersError,
  OnboardingAlreadyCompletedError,
} from './onboarding.errors';
import { OnboardingService } from './onboarding.service';

/**
 * Ce que ces tests tiennent :
 *  — `onboardingCompletedAt` n'est posé QUE lorsque les TROIS étapes sont faites, et dans la
 *    transaction de celle qui les complète (D-057). C'est cette colonne que le garde serveur
 *    applique : la poser trop tôt ouvrirait le portail à un parcours inachevé ;
 *  — l'`UPDATE` de complétion est GARDÉ (`onboardingCompletedAt: null`) — deux étapes finales
 *    concurrentes ne peuvent pas écrire deux horodatages différents ;
 *  — aucune réponse, aucun PIN n'est écrit en clair : ce qui part en base est un hash bcrypt,
 *    et il porte la forme NORMALISÉE de la réponse, pas la saisie ;
 *  — les étapes 2 et 3 se ferment une fois le parcours terminé : sans cela, il existerait un
 *    chemin de remplacement du PIN sans aucune vérification — exactement ce que la seconde
 *    authentification est censée empêcher.
 */

const BCRYPT_PREFIX = /^\$2[aby]\$/;

interface MemberState {
  idDocumentPath: string | null;
  idDocumentType: string | null;
  idDocumentNumber: string | null;
  pinHash: string | null;
  onboardingCompletedAt: Date | null;
  verificationStatus: VerificationStatus;
  answerCount: number;
}

function makeMock(initial: Partial<MemberState> = {}) {
  const state: MemberState = {
    idDocumentPath: null,
    idDocumentType: 'ID_CARD',
    idDocumentNumber: '09876543',
    pinHash: null,
    onboardingCompletedAt: null,
    verificationStatus: VerificationStatus.PENDING,
    answerCount: 0,
    ...initial,
  };

  const created: Array<{ memberId: number; questionKey: string; answerHash: string }> =
    [];
  const calls = {
    deleteMany: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  };

  const findUnique = jest.fn(() =>
    Promise.resolve({
      ...state,
      _count: { securityAnswers: state.answerCount },
    }),
  );

  const client = {
    member: {
      findUnique,
      update: jest.fn((args: { data: Record<string, unknown> }) => {
        calls.update(args);
        if (typeof args.data.pinHash === 'string') state.pinHash = args.data.pinHash;
        if (typeof args.data.idDocumentPath === 'string') {
          state.idDocumentPath = args.data.idDocumentPath;
        }
        return Promise.resolve({});
      }),
      updateMany: jest.fn(
        (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          calls.updateMany(args);
          // Reproduit la GARDE : l'écriture n'a lieu que si la colonne est encore nulle.
          if (
            'onboardingCompletedAt' in args.where &&
            args.where.onboardingCompletedAt === null &&
            state.onboardingCompletedAt !== null
          ) {
            return Promise.resolve({ count: 0 });
          }
          if (args.data.onboardingCompletedAt instanceof Date) {
            state.onboardingCompletedAt = args.data.onboardingCompletedAt;
          }
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    memberSecurityAnswer: {
      deleteMany: jest.fn(() => {
        calls.deleteMany();
        created.length = 0;
        state.answerCount = 0;
        return Promise.resolve({ count: 0 });
      }),
      createMany: jest.fn(
        (args: {
          data: Array<{ memberId: number; questionKey: string; answerHash: string }>;
        }) => {
          created.push(...args.data);
          state.answerCount = created.length;
          return Promise.resolve({ count: args.data.length });
        },
      ),
    },
  };

  const prisma = {
    ...client,
    $transaction: jest.fn((cb: (tx: typeof client) => Promise<unknown>) =>
      cb(client),
    ),
  };

  return { state, created, calls, prisma };
}

function makeService(mock: ReturnType<typeof makeMock>) {
  const documents = {
    store: jest.fn(() =>
      Promise.resolve({ relativePath: 'id-documents/2026-07/x.jpg', mime: 'image/jpeg' }),
    ),
    discard: jest.fn(() => Promise.resolve()),
  };
  const service = new OnboardingService(
    mock.prisma as unknown as PrismaService,
    // Rounds bas : ces tests hachent plusieurs secrets, on ne mesure pas bcrypt ici.
    { get: () => '4' } as unknown as ConfigService,
    documents as unknown as IdentityDocumentService,
  );
  return { service, documents };
}

const THREE_ANSWERS = [
  { questionKey: 'FIRST_SCHOOL', answer: '  École  Ibn Khaldoun ' },
  { questionKey: 'CHILDHOOD_NICKNAME', answer: 'Momo' },
  { questionKey: 'FIRST_PET_NAME', answer: 'Bella' },
];

describe('OnboardingService — questions secrètes', () => {
  it('refuse un nombre de questions différent de trois', async () => {
    const mock = makeMock();
    const { service } = makeService(mock);
    await expect(
      service.setSecurityQuestions(42, THREE_ANSWERS.slice(0, 2)),
    ).rejects.toBeInstanceOf(InvalidSecurityAnswersError);
  });

  it('refuse deux fois la même question — le tirage aléatoire n’aurait plus rien à tirer', async () => {
    const mock = makeMock();
    const { service } = makeService(mock);
    await expect(
      service.setSecurityQuestions(42, [
        THREE_ANSWERS[0],
        THREE_ANSWERS[0],
        THREE_ANSWERS[2],
      ]),
    ).rejects.toBeInstanceOf(InvalidSecurityAnswersError);
  });

  it('refuse une clé hors catalogue', async () => {
    const mock = makeMock();
    const { service } = makeService(mock);
    await expect(
      service.setSecurityQuestions(42, [
        { questionKey: 'FAVORITE_COLOR', answer: 'bleu' },
        THREE_ANSWERS[1],
        THREE_ANSWERS[2],
      ]),
    ).rejects.toBeInstanceOf(InvalidSecurityAnswersError);
  });

  it('refuse une réponse qui n’est que des espaces (contrôle sur la forme NORMALISÉE)', async () => {
    const mock = makeMock();
    const { service } = makeService(mock);
    await expect(
      service.setSecurityQuestions(42, [
        { questionKey: 'FIRST_SCHOOL', answer: '   ' },
        THREE_ANSWERS[1],
        THREE_ANSWERS[2],
      ]),
    ).rejects.toBeInstanceOf(InvalidSecurityAnswersError);
  });

  it('hache la forme NORMALISÉE et n’écrit aucune réponse en clair', async () => {
    const mock = makeMock();
    const { service } = makeService(mock);
    await service.setSecurityQuestions(42, THREE_ANSWERS);

    expect(mock.created).toHaveLength(3);
    for (const row of mock.created) {
      expect(row.answerHash).toMatch(BCRYPT_PREFIX);
    }
    // Aucune saisie ne se retrouve telle quelle dans ce qui part en base.
    const serialized = JSON.stringify(mock.created);
    expect(serialized).not.toContain('École');
    expect(serialized).not.toContain('Momo');
    expect(serialized).not.toContain('Bella');
  });

  it('remplace le lot précédent plutôt que de l’empiler', async () => {
    const mock = makeMock();
    const { service } = makeService(mock);
    await service.setSecurityQuestions(42, THREE_ANSWERS);
    expect(mock.calls.deleteMany).toHaveBeenCalled();
    expect(mock.created).toHaveLength(3);
  });

  it('se ferme une fois le parcours terminé', async () => {
    const mock = makeMock({ onboardingCompletedAt: new Date() });
    const { service } = makeService(mock);
    await expect(
      service.setSecurityQuestions(42, THREE_ANSWERS),
    ).rejects.toBeInstanceOf(OnboardingAlreadyCompletedError);
  });
});

describe('OnboardingService — PIN', () => {
  it('refuse un format invalide', async () => {
    const mock = makeMock();
    const { service } = makeService(mock);
    await expect(service.setPin(42, '12')).rejects.toBeInstanceOf(InvalidPinError);
    await expect(service.setPin(42, 'abcd')).rejects.toBeInstanceOf(InvalidPinError);
  });

  it('refuse un PIN trop devinable', async () => {
    const mock = makeMock();
    const { service } = makeService(mock);
    await expect(service.setPin(42, '1234')).rejects.toBeInstanceOf(InvalidPinError);
    await expect(service.setPin(42, '0000')).rejects.toBeInstanceOf(InvalidPinError);
  });

  it('hache le PIN — il n’existe jamais en clair', async () => {
    const mock = makeMock();
    const { service } = makeService(mock);
    await service.setPin(42, '4827');
    expect(mock.state.pinHash).toMatch(BCRYPT_PREFIX);
    expect(mock.state.pinHash).not.toContain('4827');
  });

  it('se ferme une fois le parcours terminé', async () => {
    const mock = makeMock({ onboardingCompletedAt: new Date() });
    const { service } = makeService(mock);
    await expect(service.setPin(42, '4827')).rejects.toBeInstanceOf(
      OnboardingAlreadyCompletedError,
    );
  });
});

describe('OnboardingService — complétion du parcours (D-057)', () => {
  it('ne termine PAS le parcours tant qu’il manque une étape', async () => {
    const mock = makeMock(); // ni pièce, ni questions
    const { service } = makeService(mock);
    await service.setPin(42, '4827');
    expect(mock.state.onboardingCompletedAt).toBeNull();
  });

  it('termine le parcours à la TROISIÈME étape, quel que soit son ordre', async () => {
    const mock = makeMock({ idDocumentPath: 'id-documents/2026-07/x.jpg' });
    const { service } = makeService(mock);

    await service.setSecurityQuestions(42, THREE_ANSWERS);
    expect(mock.state.onboardingCompletedAt).toBeNull(); // il manque le PIN

    await service.setPin(42, '4827');
    expect(mock.state.onboardingCompletedAt).toBeInstanceOf(Date);
  });

  it('garde l’UPDATE de complétion par `onboardingCompletedAt: null`', async () => {
    const mock = makeMock({ idDocumentPath: 'x.jpg', answerCount: 3 });
    const { service } = makeService(mock);
    await service.setPin(42, '4827');

    expect(mock.calls.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ onboardingCompletedAt: null }),
      }),
    );
  });

  it('rapporte l’état des trois étapes sans le recalculer', async () => {
    const mock = makeMock({
      idDocumentPath: 'x.jpg',
      pinHash: '$2a$04$hash',
      answerCount: 3,
      onboardingCompletedAt: new Date(),
    });
    const { service } = makeService(mock);

    await expect(service.status(42)).resolves.toEqual({
      idDocumentUploaded: true,
      securityQuestionsSet: true,
      pinSet: true,
      completed: true,
      idDocumentType: 'ID_CARD',
      idDocumentNumber: '09876543',
      verificationStatus: VerificationStatus.PENDING,
    });
  });
});

describe('OnboardingService — dépôt de la pièce', () => {
  it('supprime le fichier si la transaction échoue — jamais de ligne pointant vers rien', async () => {
    const mock = makeMock();
    const { service, documents } = makeService(mock);
    mock.prisma.$transaction.mockRejectedValueOnce(new Error('boom'));

    await expect(
      service.uploadIdDocument(42, { buffer: Buffer.alloc(20), size: 20 }),
    ).rejects.toThrow('boom');
    expect(documents.discard).toHaveBeenCalledWith('id-documents/2026-07/x.jpg');
  });

  it('supprime l’ANCIENNE image seulement après un remplacement réussi', async () => {
    const mock = makeMock({ idDocumentPath: 'id-documents/2026-06/ancien.jpg' });
    const { service, documents } = makeService(mock);

    await service.uploadIdDocument(42, { buffer: Buffer.alloc(20), size: 20 });
    expect(documents.discard).toHaveBeenCalledWith(
      'id-documents/2026-06/ancien.jpg',
    );
  });
});
