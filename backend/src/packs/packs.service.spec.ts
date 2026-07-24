import { Prisma } from '@prisma/client';
import { money } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import {
  PackNameTakenError,
  PackNotFoundError,
  WeeklyCapBelowCommissionError,
} from './packs.errors';
import { PacksService } from './packs.service';

/**
 * Ce que ces tests tiennent :
 *  — la règle « plafond ≥ commissions » (spec §7.2.4) porte sur les DEUX commissions et,
 *    en modification partielle, sur les valeurs RÉSULTANTES et non sur le corps envoyé ;
 *  — les montants entrent en `number` (JSON n'a que ça) et ne circulent qu'en `Decimal`
 *    au-delà de la frontière, jusqu'à ressortir en chaîne à 3 décimales ;
 *  — aucune méthode de suppression n'existe (l'historique d'activation en dépend) ;
 *  — un doublon de nom est tranché par la CONTRAINTE, pas par un contrôle préalable.
 */

const SILVER = {
  id: 1,
  name: 'Silver',
  tierBv: 1000,
  priceDt: money(2200),
  directCommissionDt: money(500),
  indirectCommissionDt: money(250),
  weeklyCapDt: money(10000),
  active: true,
  _count: { members: 12 },
};

function prismaMock() {
  const pack = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const auditLog = { create: jest.fn().mockResolvedValue({}) };
  return { pack, auditLog };
}

describe('PacksService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: PacksService;

  beforeEach(() => {
    prisma = prismaMock();
    service = new PacksService(prisma as unknown as PrismaService);
  });

  it('n’expose AUCUNE suppression : un pack se désactive, il ne s’efface pas', () => {
    // L'historique en dépend (Member.packId, Member.activationSnapshot). Ce test échouera
    // le jour où quelqu'un ajoutera un `delete` « pour faire propre ».
    expect((service as unknown as Record<string, unknown>).delete).toBeUndefined();
    expect((service as unknown as Record<string, unknown>).remove).toBeUndefined();
  });

  it('rend les DINARS en chaîne à 3 décimales et le palier en entier (D-028)', async () => {
    prisma.pack.findMany.mockResolvedValue([SILVER]);

    const [view] = await service.list();

    expect(view.tierBv).toBe(1000); // POINTS : un entier, jamais de décimale
    expect(view.priceDt).toBe('2200.000');
    expect(view.directCommissionDt).toBe('500.000');
    expect(view.weeklyCapDt).toBe('10000.000');
    expect(view.memberCount).toBe(12);
  });

  it('trie par palier croissant — l’écran n’a rien à réordonner', async () => {
    prisma.pack.findMany.mockResolvedValue([]);

    await service.list();

    expect(prisma.pack.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ tierBv: 'asc' }, { id: 'asc' }] }),
    );
  });

  it('refuse un plafond inférieur à la commission DIRECTE', async () => {
    await expect(
      service.create(7, {
        name: 'Bancal',
        tierBv: 1000,
        priceDt: 2200,
        directCommissionDt: 500,
        indirectCommissionDt: 250,
        weeklyCapDt: 400, // < 500
      }),
    ).rejects.toBeInstanceOf(WeeklyCapBelowCommissionError);

    expect(prisma.pack.create).not.toHaveBeenCalled();
  });

  it('refuse un plafond inférieur à la commission INDIRECTE, même s’il couvre la directe', async () => {
    await expect(
      service.create(7, {
        name: 'Bancal',
        tierBv: 1000,
        priceDt: 2200,
        directCommissionDt: 100,
        indirectCommissionDt: 250,
        weeklyCapDt: 200, // ≥ directe (100) mais < indirecte (250)
      }),
    ).rejects.toBeInstanceOf(WeeklyCapBelowCommissionError);
  });

  it('convertit les montants en Decimal à la frontière, jamais en flottant', async () => {
    prisma.pack.create.mockResolvedValue(SILVER);

    await service.create(7, {
      name: 'Silver',
      tierBv: 1000,
      priceDt: 2200,
      directCommissionDt: 500,
      indirectCommissionDt: 250,
      weeklyCapDt: 10000,
      active: true,
    });

    const data = prisma.pack.create.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data.priceDt).toBeInstanceOf(Prisma.Decimal);
    expect(data.weeklyCapDt).toBeInstanceOf(Prisma.Decimal);
    expect(data.tierBv).toBe(1000); // les POINTS restent un entier nu
  });

  it('trace la création dans AuditLog, montants en CHAÎNE (jamais un flottant en JSON)', async () => {
    prisma.pack.create.mockResolvedValue(SILVER);

    await service.create(7, {
      name: 'Silver',
      tierBv: 1000,
      priceDt: 2200,
      directCommissionDt: 500,
      indirectCommissionDt: 250,
      weeklyCapDt: 10000,
    });

    const entry = prisma.auditLog.create.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(entry.action).toBe('PACK_CREATED');
    expect(entry.target).toBe('Pack:1');
    expect(entry.actor).toBe('7');
    expect(entry.after).toMatchObject({ priceDt: '2200.000', tierBv: 1000 });
  });

  /**
   * LE cas que la validation partielle doit attraper : la requête ne parle QUE du plafond,
   * mais c'est la commission déjà en base qui rend le couple invalide. Valider le corps de
   * la requête au lieu de l'état résultant laisserait passer ce pack.
   */
  it('modification partielle : le plafond est confronté à la commission DÉJÀ en base', async () => {
    prisma.pack.findUnique.mockResolvedValue(SILVER);

    await expect(
      service.update(7, 1, { weeklyCapDt: 300 }), // < directe (500), non mentionnée
    ).rejects.toBeInstanceOf(WeeklyCapBelowCommissionError);

    expect(prisma.pack.update).not.toHaveBeenCalled();
  });

  it('modification partielle : baisser la commission sous le plafond existant passe', async () => {
    prisma.pack.findUnique.mockResolvedValue(SILVER);
    prisma.pack.update.mockResolvedValue({
      ...SILVER,
      directCommissionDt: money(400),
    });

    const view = await service.update(7, 1, { directCommissionDt: 400 });

    expect(view.directCommissionDt).toBe('400.000');
    const data = prisma.pack.update.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    // Mise à jour PARTIELLE : les champs non fournis ne sont pas réécrits.
    expect(Object.keys(data)).toEqual(['directCommissionDt']);
  });

  it('désactiver un pack ne touche à rien d’autre (l’historique reste intact)', async () => {
    prisma.pack.findUnique.mockResolvedValue(SILVER);
    prisma.pack.update.mockResolvedValue({ ...SILVER, active: false });

    const view = await service.update(7, 1, { active: false });

    expect(view.active).toBe(false);
    expect(prisma.pack.update.mock.calls[0][0].data).toEqual({ active: false });
  });

  it('pack inconnu : 404 avant toute écriture', async () => {
    prisma.pack.findUnique.mockResolvedValue(null);

    await expect(service.update(7, 404, { active: false })).rejects.toBeInstanceOf(
      PackNotFoundError,
    );
    await expect(service.getOne(404)).rejects.toBeInstanceOf(PackNotFoundError);
  });

  it('doublon de nom : la contrainte unique tranche, pas un contrôle préalable', async () => {
    // Pré-vérifier laisserait une fenêtre entre le SELECT et l'INSERT, où deux requêtes
    // concurrentes passeraient toutes les deux. La contrainte, elle, n'a pas de fenêtre.
    prisma.pack.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create(7, {
        name: 'Silver',
        tierBv: 1000,
        priceDt: 2200,
        directCommissionDt: 500,
        indirectCommissionDt: 250,
        weeklyCapDt: 10000,
      }),
    ).rejects.toBeInstanceOf(PackNameTakenError);

    expect(prisma.pack.findMany).not.toHaveBeenCalled();
    expect(prisma.pack.findUnique).not.toHaveBeenCalled();
  });
});
