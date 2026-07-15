import { EcardOrigin, EcardStatus, LedgerMovementType, Prisma } from '@prisma/client';
import { money } from '../common/money';
import { InsufficientBalanceError } from '../ledger/ledger.errors';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  EcardAlreadyConsumedError,
  EcardAlreadyUnlimitedError,
  EcardExpiredError,
  EcardNotActiveError,
  EcardNotFoundError,
  EcardNotOwnedError,
  EcardValueMismatchError,
  InvalidExpirationDaysError,
} from './ecards.errors';
import { EcardsService } from './ecards.service';

/**
 * Règles de l'e-card, Prisma mocké : ce qui est vérifié ici, ce sont les DÉCISIONS (refuser,
 * débiter, ne PAS créditer) et l'ORDRE des écritures. L'atomicité réelle, la concurrence et
 * le rollback sont couverts par `ecards.int-spec.ts`, contre un vrai Postgres.
 *
 * UNITÉ : le DINAR (D-028). Une e-card est de l'argent — sa valeur est un `Decimal`, et les
 * montants brûlés/comparés le sont en DT.
 */

const DAY_MS = 86_400_000;

/**
 * Forme d'une ligne `Ecard` telle que les lookups la renvoient. Typée explicitement (et non
 * inférée depuis la fixture) : sinon TypeScript fige `status: 'ACTIVE'` et `creatorId: number`
 * en littéraux, et les scénarios qui les font varier (USED, genèse sans créateur) ne compilent pas.
 */
type EcardRow = {
  id: number;
  code: string;
  valueDt: Prisma.Decimal;
  status: EcardStatus;
  origin: EcardOrigin;
  creatorId: number | null;
  createdByAdminId: number | null;
  userId: number | null;
  createdAt: Date;
  usedAt: Date | null;
  expiresAt: Date | null;
  closedAt: Date | null;
};

const ACTIVE_ECARD: EcardRow = {
  id: 7,
  code: 'HHD-7Z7-JJD-77D',
  valueDt: money(2200),
  status: EcardStatus.ACTIVE,
  origin: EcardOrigin.MEMBER,
  creatorId: 42,
  createdByAdminId: null,
  userId: null,
  createdAt: new Date('2026-01-01'),
  usedAt: null,
  expiresAt: new Date('2099-01-01'),
  closedAt: null,
};

interface Scenario {
  /** Valeur du paramètre système ecard_expiration_days. */
  expirationDays?: string | null;
  /** E-card renvoyée par les lookups (null = code inconnu). */
  ecard?: EcardRow | null;
  /** Lignes rendues par l'UPDATE gardé (0 ligne = la carte a changé d'état entre-temps). */
  guardedRows?: unknown[];
  /** Le grand livre refuse le mouvement (solde insuffisant). */
  ledgerThrows?: Error;
}

function makeService(scenario: Scenario = {}) {
  const ecardFindUnique = jest.fn(async () =>
    scenario.ecard === undefined ? ACTIVE_ECARD : scenario.ecard,
  );
  const ecardCreate = jest.fn(
    async (args: { data: Record<string, unknown> }) => ({
      ...ACTIVE_ECARD,
      ...args.data,
      id: 7,
    }),
  );
  const queryRaw = jest.fn(
    async (..._args: unknown[]) =>
      scenario.guardedRows ?? [{ id: 7, valueDt: '2200.000' }],
  );
  const ledgerEntryUpdate = jest.fn(async (..._args: unknown[]) => ({}));
  const auditCreate = jest.fn(async (..._args: unknown[]) => ({}));

  const tx = {
    $queryRaw: queryRaw,
    ecard: { findUnique: ecardFindUnique, create: ecardCreate },
    ledgerEntry: { update: ledgerEntryUpdate },
    auditLog: { create: auditCreate },
  };

  const prisma = {
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    setting: {
      findUnique: jest.fn(async () =>
        scenario.expirationDays === null
          ? null
          : {
              key: 'ecard_expiration_days',
              value: scenario.expirationDays ?? '180',
            },
      ),
    },
    ecard: { findUnique: ecardFindUnique, findMany: jest.fn(async () => []) },
  } as unknown as PrismaService;

  const recordMovementInTx = jest.fn(async () => {
    if (scenario.ledgerThrows) {
      throw scenario.ledgerThrows;
    }
    return { id: 55, balanceAfterDt: money(0) };
  });
  const ledger = { recordMovementInTx } as unknown as LedgerService;

  return {
    service: new EcardsService(prisma, ledger),
    recordMovementInTx,
    ecardCreate,
    ledgerEntryUpdate,
    queryRaw,
    auditCreate,
    tx: tx as unknown as Prisma.TransactionClient,
  };
}

/** Le montant `amountDt` d'un appel à `recordMovementInTx`, en chaîne pour comparaison exacte. */
function movementAmount(
  recordMovementInTx: jest.Mock,
  call = 0,
): { memberId: number; type: string; amount: string; ecardId?: number } {
  const arg = recordMovementInTx.mock.calls[call][1] as {
    memberId: number;
    type: string;
    amountDt: Prisma.Decimal;
    ecardId?: number;
  };
  return {
    memberId: arg.memberId,
    type: arg.type,
    amount: arg.amountDt.toString(),
    ecardId: arg.ecardId,
  };
}

describe('EcardsService.create — création plafonnée au solde', () => {
  it('débite le créateur du montant EXACT (en DT), en mouvement ECARD_CREATION', async () => {
    const s = makeService();
    await s.service.create({ creatorId: 42, valueDt: money(2200) });

    expect(movementAmount(s.recordMovementInTx)).toEqual({
      memberId: 42,
      type: LedgerMovementType.ECARD_CREATION,
      amount: '-2200',
      ecardId: undefined,
    });
  });

  it('crée l’e-card ACTIVE, d’origine MEMBER, au montant demandé', async () => {
    const s = makeService();
    const view = await s.service.create({ creatorId: 42, valueDt: money(2200) });

    const data = s.ecardCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: EcardStatus.ACTIVE,
      origin: EcardOrigin.MEMBER,
      creatorId: 42,
    });
    expect((data.valueDt as Prisma.Decimal).toString()).toBe('2200');
    expect(view.status).toBe(EcardStatus.ACTIVE);
    expect(view.valueDt).toBe('2200.000');
  });

  it('création > solde → REFUSÉE : le grand livre lève, aucune e-card n’est créée', async () => {
    const s = makeService({
      ledgerThrows: new InsufficientBalanceError(42, money(300), money(-2200)),
    });

    await expect(
      s.service.create({ creatorId: 42, valueDt: money(2200) }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
    expect(s.ecardCreate).not.toHaveBeenCalled();
  });

  it('débite AVANT d’insérer l’e-card (ordre Member → Ecard, D-024)', async () => {
    const s = makeService();
    await s.service.create({ creatorId: 42, valueDt: money(2200) });

    expect(s.recordMovementInTx.mock.invocationCallOrder[0]).toBeLessThan(
      s.ecardCreate.mock.invocationCallOrder[0],
    );
  });

  it('rattache la ligne de mouvement à l’e-card (piste d’audit complète)', async () => {
    const s = makeService();
    await s.service.create({ creatorId: 42, valueDt: money(2200) });

    expect(s.ledgerEntryUpdate).toHaveBeenCalledWith({
      where: { id: 55 },
      data: { ecardId: 7 },
    });
  });

  it('expiration paramétrée à 180 j → échéance à +180 j', async () => {
    const s = makeService({ expirationDays: '180' });
    await s.service.create({ creatorId: 42, valueDt: money(2200) });

    const expiresAt = s.ecardCreate.mock.calls[0][0].data.expiresAt as Date;
    const days = (expiresAt.getTime() - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(179.9);
    expect(days).toBeLessThan(180.1);
  });

  it('expiration paramétrée à -1 → e-card sans échéance (illimitée, D-008)', async () => {
    const s = makeService({ expirationDays: '-1' });
    await s.service.create({ creatorId: 42, valueDt: money(2200) });

    expect(s.ecardCreate.mock.calls[0][0].data.expiresAt).toBeNull();
  });

  it('paramètre corrompu → refuse d’émettre plutôt que d’écrire une échéance absurde', async () => {
    const s = makeService({ expirationDays: 'cent-quatre-vingts' });
    await expect(
      s.service.create({ creatorId: 42, valueDt: money(2200) }),
    ).rejects.toThrow(/ecard_expiration_days/);
    expect(s.recordMovementInTx).not.toHaveBeenCalled();
  });
});

describe('EcardsService.consumeInTx — consommation (D-025)', () => {
  it('valeur = montant dû → e-card brûlée USED, et AUCUN mouvement de solde', async () => {
    const s = makeService();
    const consumed = await s.service.consumeInTx(s.tx, {
      code: 'HHD-7Z7-JJD-77D',
      memberId: 9,
      dueDt: money(2200),
    });

    expect(consumed.ecardId).toBe(7);
    expect(consumed.valueDt.toString()).toBe('2200');
    expect(String(s.queryRaw.mock.calls[0][0])).toContain("'USED'");
    // LE point du modèle : l'e-card PAIE, elle ne recharge pas. Un crédit ici ferait
    // transiter de l'argent par un solde qui n'a jamais eu à le porter.
    expect(s.recordMovementInTx).not.toHaveBeenCalled();
  });

  it('valeur ≠ montant dû → REFUSÉE (couverture exacte, spec §5.5) : rien n’est brûlé', async () => {
    const s = makeService();
    await expect(
      s.service.consumeInTx(s.tx, {
        code: 'HHD-7Z7-JJD-77D',
        memberId: 9,
        dueDt: money(3350), // prix Gold contre une carte de 2200
      }),
    ).rejects.toBeInstanceOf(EcardValueMismatchError);
    expect(s.queryRaw).not.toHaveBeenCalled();
  });

  it('e-card déjà USED → non réutilisable (une utilisation est définitive)', async () => {
    const s = makeService({
      ecard: { ...ACTIVE_ECARD, status: EcardStatus.USED },
    });
    await expect(
      s.service.consumeInTx(s.tx, {
        code: 'HHD-7Z7-JJD-77D',
        memberId: 9,
        dueDt: money(2200),
      }),
    ).rejects.toBeInstanceOf(EcardNotActiveError);
    expect(s.queryRaw).not.toHaveBeenCalled();
  });

  it('e-card REVOKED → refusée', async () => {
    const s = makeService({
      ecard: { ...ACTIVE_ECARD, status: EcardStatus.REVOKED },
    });
    await expect(
      s.service.consumeInTx(s.tx, {
        code: 'HHD-7Z7-JJD-77D',
        memberId: 9,
        dueDt: money(2200),
      }),
    ).rejects.toBeInstanceOf(EcardNotActiveError);
  });

  it('échéance dépassée mais cron pas encore passé → refusée (l’échéance fait foi)', async () => {
    const s = makeService({
      ecard: { ...ACTIVE_ECARD, expiresAt: new Date(Date.now() - DAY_MS) },
    });
    await expect(
      s.service.consumeInTx(s.tx, {
        code: 'HHD-7Z7-JJD-77D',
        memberId: 9,
        dueDt: money(2200),
      }),
    ).rejects.toBeInstanceOf(EcardExpiredError);
  });

  it('code inconnu → introuvable', async () => {
    const s = makeService({ ecard: null });
    await expect(
      s.service.consumeInTx(s.tx, {
        code: 'AAA-BBB-CCC-DDD',
        memberId: 9,
        dueDt: money(2200),
      }),
    ).rejects.toBeInstanceOf(EcardNotFoundError);
  });

  it('carte consommée entre la lecture et l’UPDATE gardé → la perdante lève (course)', async () => {
    const s = makeService({ guardedRows: [] }); // 0 ligne : status n'est plus ACTIVE
    await expect(
      s.service.consumeInTx(s.tx, {
        code: 'HHD-7Z7-JJD-77D',
        memberId: 9,
        dueDt: money(2200),
      }),
    ).rejects.toBeInstanceOf(EcardAlreadyConsumedError);
  });

  it('e-card sans échéance (illimitée) → consommable', async () => {
    const s = makeService({ ecard: { ...ACTIVE_ECARD, expiresAt: null } });
    const consumed = await s.service.consumeInTx(s.tx, {
      code: 'HHD-7Z7-JJD-77D',
      memberId: 9,
      dueDt: money(2200),
    });
    expect(consumed.ecardId).toBe(7);
    expect(consumed.valueDt.toString()).toBe('2200');
  });
});

describe('EcardsService.extend — prolongation (D-026)', () => {
  it('le créateur prolonge sa propre e-card ACTIVE', async () => {
    const s = makeService();
    const view = await s.service.extend({
      ecardId: 7,
      days: 30,
      actorMemberId: 42, // = creatorId
      actorAdminId: null,
    });

    const pushed =
      view.expiresAt!.getTime() - ACTIVE_ECARD.expiresAt!.getTime();
    expect(pushed).toBe(30 * DAY_MS);
  });

  it('un membre qui n’est pas le créateur → refusé', async () => {
    const s = makeService();
    await expect(
      s.service.extend({
        ecardId: 7,
        days: 30,
        actorMemberId: 99,
        actorAdminId: null,
      }),
    ).rejects.toBeInstanceOf(EcardNotOwnedError);
  });

  it('l’admin prolonge n’importe quelle e-card (aucun contrôle de propriété)', async () => {
    const s = makeService();
    await expect(
      s.service.extend({
        ecardId: 7,
        days: 30,
        actorMemberId: null,
        actorAdminId: 3,
      }),
    ).resolves.toBeDefined();
  });

  it('e-card illimitée → rien à prolonger', async () => {
    const s = makeService({ ecard: { ...ACTIVE_ECARD, expiresAt: null } });
    await expect(
      s.service.extend({
        ecardId: 7,
        days: 30,
        actorMemberId: 42,
        actorAdminId: null,
      }),
    ).rejects.toBeInstanceOf(EcardAlreadyUnlimitedError);
  });

  it('e-card EXPIRED (déjà remboursée) → NON prolongeable : la ressusciter créerait de la valeur', async () => {
    const s = makeService({
      ecard: { ...ACTIVE_ECARD, status: EcardStatus.EXPIRED },
    });
    await expect(
      s.service.extend({
        ecardId: 7,
        days: 30,
        actorMemberId: 42,
        actorAdminId: null,
      }),
    ).rejects.toBeInstanceOf(EcardNotActiveError);
  });

  it('échéance déjà passée → repoussée depuis MAINTENANT (sinon la prolongation serait inopérante)', async () => {
    const s = makeService({
      ecard: { ...ACTIVE_ECARD, expiresAt: new Date(Date.now() - 40 * DAY_MS) },
    });
    const view = await s.service.extend({
      ecardId: 7,
      days: 10,
      actorMemberId: 42,
      actorAdminId: null,
    });

    expect(view.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('EcardsService.revoke — révocation admin', () => {
  it('rembourse le créateur du montant exact (ECARD_REFUND, en DT) et passe la carte REVOKED', async () => {
    const s = makeService();
    const view = await s.service.revoke({
      ecardId: 7,
      adminId: 3,
      reason: 'Litige',
    });

    expect(movementAmount(s.recordMovementInTx)).toEqual({
      memberId: 42,
      type: LedgerMovementType.ECARD_REFUND,
      amount: '2200',
      ecardId: 7,
    });
    expect(view.status).toBe(EcardStatus.REVOKED);
  });

  it('rembourse AVANT de revendiquer l’e-card (ordre Member → Ecard, D-024)', async () => {
    const s = makeService();
    await s.service.revoke({ ecardId: 7, adminId: 3 });

    // Verrouiller l'e-card d'abord croiserait l'ordre de l'activation (chaîne Member
    // verrouillée, PUIS carte brûlée) et rouvrirait l'interblocage de la Tranche 4.
    expect(s.recordMovementInTx.mock.invocationCallOrder[0]).toBeLessThan(
      s.queryRaw.mock.invocationCallOrder[0],
    );
  });

  it('e-card de GENÈSE → aucun remboursement (personne n’a été débité)', async () => {
    const s = makeService({
      ecard: {
        ...ACTIVE_ECARD,
        origin: EcardOrigin.GENESIS,
        creatorId: null,
        createdByAdminId: 3,
      },
    });
    await s.service.revoke({ ecardId: 7, adminId: 3 });

    expect(s.recordMovementInTx).not.toHaveBeenCalled();
  });

  it('e-card déjà USED → révocation refusée (USED est définitif)', async () => {
    const s = makeService({
      ecard: { ...ACTIVE_ECARD, status: EcardStatus.USED },
    });
    await expect(
      s.service.revoke({ ecardId: 7, adminId: 3 }),
    ).rejects.toBeInstanceOf(EcardNotActiveError);
    expect(s.recordMovementInTx).not.toHaveBeenCalled();
  });

  it('trace la révocation dans l’AuditLog, sans jamais écrire le code en clair', async () => {
    const s = makeService();
    await s.service.revoke({ ecardId: 7, adminId: 3 });

    const data = s.auditCreate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.data.action).toBe('ECARD_REVOKED');
    expect(data.data.target).toBe('Ecard:7');
    expect(JSON.stringify(data.data)).not.toContain(ACTIVE_ECARD.code);
  });
});

describe('EcardsService.genesis — création de valeur ex nihilo', () => {
  it('crée une e-card GENESIS sans créateur ni débit d’aucun solde', async () => {
    const s = makeService();
    await s.service.genesis({ adminId: 3, valueDt: money(2200) });

    const data = s.ecardCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      origin: EcardOrigin.GENESIS,
      creatorId: null,
      createdByAdminId: 3,
    });
    expect((data.valueDt as Prisma.Decimal).toString()).toBe('2200');
    expect(s.recordMovementInTx).not.toHaveBeenCalled();
  });

  it('durée de validité explicite -1 → illimitée', async () => {
    const s = makeService();
    await s.service.genesis({ adminId: 3, valueDt: money(2200), expirationDays: -1 });
    expect(s.ecardCreate.mock.calls[0][0].data.expiresAt).toBeNull();
  });

  it('durée de validité absurde (0 jour) → 400, pas une e-card mort-née', async () => {
    const s = makeService();
    await expect(
      s.service.genesis({ adminId: 3, valueDt: money(2200), expirationDays: 0 }),
    ).rejects.toBeInstanceOf(InvalidExpirationDaysError);
    expect(s.ecardCreate).not.toHaveBeenCalled();
  });

  it('trace la genèse (création de valeur) dans l’AuditLog', async () => {
    const s = makeService();
    await s.service.genesis({ adminId: 3, valueDt: money(2200), reason: 'Promo' });

    const data = s.auditCreate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.data.action).toBe('ECARD_GENESIS');
    expect(data.data.actor).toBe('3');
  });
});
