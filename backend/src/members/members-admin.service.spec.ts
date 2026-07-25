import {
  IdDocumentType,
  Leg,
  MemberStatus,
  VerificationStatus,
} from '@prisma/client';
import { money } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { MembersAdminService } from './members-admin.service';
import { MemberNotFoundError } from './members.errors';

/**
 * Ce que ces tests tiennent :
 *  — les deux dimensions restent séparées à la sortie (D-028) : points entiers, dinars en
 *    chaîne à 3 décimales ;
 *  — la fiche n'expose JAMAIS `idDocumentPath` ni `passwordHash`, seulement le fait qu'un
 *    document existe ;
 *  — sponsor et upline de placement sont deux champs DISTINCTS, jamais fusionnés ;
 *  — le tri est toujours TOTAL (départagé par `id`), sinon la pagination duplique des lignes ;
 *  — la borne haute d'une période en date nue inclut la journée entière.
 */

const BASE = {
  id: 42,
  memberCode: 'NP000042',
  firstName: 'Amine',
  lastName: 'Ben Salah',
  email: 'amine@example.tn',
  phone: null,
  passwordHash: 'NE-DOIT-JAMAIS-SORTIR',
  status: MemberStatus.ACTIVE,
  packId: 1,
  pack: { name: 'Silver' },
  activationTierBv: 1000,
  activationSnapshot: { packName: 'Silver', tierBv: 1000, priceDt: '2200.000' },
  sponsorId: 7,
  uplineId: 9,
  leg: Leg.LEFT,
  balanceDt: money('1250.5'),
  registeredAt: new Date('2026-01-05T10:00:00Z'),
  activatedAt: new Date('2026-01-06T10:00:00Z'),
  renewalAt: null,
  baselineLeft: 3000,
  baselineRight: 1000,
  leftPoints: 7000,
  rightPoints: 4000,
  carriedLeftPoints: 2000,
  carriedRightPoints: 1000,
  startupBonusUsed: true,
  lifetimeBalanceCount: 6,
  rewardPoints: 1,
  activatedDescendants: 11,
  idDocumentType: IdDocumentType.ID_CARD,
  idDocumentNumber: '01234567',
  idDocumentPath: 'id-documents/2026-01/secret.jpg',
  verificationStatus: VerificationStatus.PENDING,
  registrationPaidDt: money(100),
  downlines: [
    {
      id: 51,
      memberCode: 'NP000051',
      firstName: 'Sonia',
      lastName: 'T.',
      status: MemberStatus.ACTIVE,
      leg: Leg.LEFT,
    },
  ],
  sponsor: {
    id: 7,
    memberCode: 'NP000007',
    firstName: 'Karim',
    lastName: 'S.',
    status: MemberStatus.ACTIVE,
  },
  upline: {
    id: 9,
    memberCode: 'NP000009',
    firstName: 'Leila',
    lastName: 'M.',
    status: MemberStatus.INACTIVE,
  },
};

function prismaMock() {
  const member = { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() };
  return {
    member,
    // `$transaction([...])` de lecture : on résout simplement le tableau de promesses.
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

describe('MembersAdminService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: MembersAdminService;

  beforeEach(() => {
    prisma = prismaMock();
    service = new MembersAdminService(prisma as unknown as PrismaService);
  });

  describe('list', () => {
    beforeEach(() => {
      prisma.member.findMany.mockResolvedValue([BASE]);
      prisma.member.count.mockResolvedValue(1);
    });

    it('sépare les unités : solde en chaîne à 3 décimales, jamais un flottant', async () => {
      const page = await service.list();

      expect(page.items[0].balanceDt).toBe('1250.500');
      expect(page.total).toBe(1);
      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(20);
    });

    it('rend les downlines PAR JAMBE, la position libre restant nulle', async () => {
      const [item] = (await service.list()).items;

      expect(item.leftDownline?.memberCode).toBe('NP000051');
      expect(item.rightDownline).toBeNull(); // position droite libre
    });

    it('n’expose ni hash de mot de passe, ni chemin de pièce d’identité', async () => {
      const [item] = (await service.list()).items;

      expect(item).not.toHaveProperty('passwordHash');
      expect(item).not.toHaveProperty('idDocumentPath');
    });

    /**
     * Un `ORDER BY registeredAt` seul n'est pas TOTAL : deux membres inscrits la même seconde
     * peuvent sortir dans un ordre différent d'une page à l'autre — l'un apparaîtrait deux
     * fois, l'autre jamais. Le départage par `id` ferme cette porte.
     */
    it('départage TOUJOURS le tri par id (pagination stable)', async () => {
      await service.list({ sort: 'registeredAt', direction: 'asc' });

      expect(prisma.member.findMany.mock.calls[0][0].orderBy).toEqual([
        { registeredAt: 'asc' },
        { id: 'asc' },
      ]);
    });

    it('tri par défaut : les derniers inscrits d’abord', async () => {
      await service.list();

      expect(prisma.member.findMany.mock.calls[0][0].orderBy).toEqual([
        { id: 'desc' },
      ]);
    });

    it('cumule les filtres pack / statut / vérification', async () => {
      await service.list({
        packId: 2,
        status: MemberStatus.INACTIVE,
        verificationStatus: VerificationStatus.PENDING,
      });

      expect(prisma.member.findMany.mock.calls[0][0].where).toMatchObject({
        packId: 2,
        status: MemberStatus.INACTIVE,
        verificationStatus: VerificationStatus.PENDING,
      });
    });

    it('cherche sur le code, le nom, le prénom, l’e-mail et le téléphone', async () => {
      await service.list({ search: 'ben' });

      const { where } = prisma.member.findMany.mock.calls[0][0];
      expect(where.OR).toHaveLength(5);
      expect(where.OR[0]).toEqual({
        memberCode: { contains: 'ben', mode: 'insensitive' },
      });
    });

    /**
     * « Jusqu'au 31/12 » doit contenir le 31 décembre EN ENTIER. Une date nue est lue comme
     * minuit : la comparer en `lte` exclurait toute la journée, et l'admin croirait que
     * personne ne s'est inscrit ce jour-là.
     */
    it('borne haute d’une date nue : la journée entière est incluse', async () => {
      await service.list({ registeredFrom: '2026-01-01', registeredTo: '2026-12-31' });

      const { registeredAt } = prisma.member.findMany.mock.calls[0][0].where;
      expect(registeredAt.gte).toEqual(new Date('2026-01-01'));
      expect(registeredAt.lt).toEqual(new Date('2027-01-01')); // exclusif au jour suivant
      expect(registeredAt.lte).toBeUndefined();
    });

    it('sans filtre de période, aucune contrainte de date n’est posée', async () => {
      await service.list();

      expect(
        prisma.member.findMany.mock.calls[0][0].where.registeredAt,
      ).toBeUndefined();
    });

    it('la pagination décale bien la fenêtre', async () => {
      await service.list({ page: 3, pageSize: 25 });

      expect(prisma.member.findMany.mock.calls[0][0]).toMatchObject({
        skip: 50,
        take: 25,
      });
    });
  });

  describe('getOne', () => {
    it('sépare POINTS (entiers) et DINARS (chaîne à 3 décimales) — D-028', async () => {
      prisma.member.findUnique.mockResolvedValue(BASE);

      const detail = await service.getOne(42);

      expect(detail.leftPoints).toBe(7000);
      expect(detail.carriedLeftPoints).toBe(2000);
      expect(detail.baselineLeft).toBe(3000);
      expect(detail.activationTierBv).toBe(1000);
      expect(detail.balanceDt).toBe('1250.500');
      expect(detail.registrationPaidDt).toBe('100.000');
    });

    /** Deux liens DISTINCTS (§5.3) : les confondre à l'écran, c'est mal lire tout le réseau. */
    it('garde sponsor et upline de placement séparés', async () => {
      prisma.member.findUnique.mockResolvedValue(BASE);

      const detail = await service.getOne(42);

      expect(detail.sponsor?.memberCode).toBe('NP000007');
      expect(detail.upline?.memberCode).toBe('NP000009');
      expect(detail.leg).toBe(Leg.LEFT);
    });

    it('signale qu’un document existe SANS jamais livrer son chemin', async () => {
      prisma.member.findUnique.mockResolvedValue(BASE);

      const detail = await service.getOne(42);

      expect(detail.hasIdDocument).toBe(true);
      expect(detail.idDocumentNumber).toBe('01234567');
      expect(detail).not.toHaveProperty('idDocumentPath');
      expect(detail).not.toHaveProperty('passwordHash');
    });

    it('expose les compteurs du moteur tels quels (aucun recalcul côté back-office)', async () => {
      prisma.member.findUnique.mockResolvedValue(BASE);

      const detail = await service.getOne(42);

      expect(detail.lifetimeBalanceCount).toBe(6);
      expect(detail.startupBonusUsed).toBe(true);
      expect(detail.rewardPoints).toBe(1);
      expect(detail.activatedDescendants).toBe(11);
    });

    it('membre inconnu : 404', async () => {
      prisma.member.findUnique.mockResolvedValue(null);

      await expect(service.getOne(404)).rejects.toBeInstanceOf(MemberNotFoundError);
    });
  });

  /**
   * Le snapshot d'activation est du JSON FIGÉ : sa forme est celle qui avait cours le jour de
   * l'activation. Les activations d'avant D-028 ont figé un plan de rémunération en `…Bv` et
   * n'ont jamais porté de prix, d'acompte ni de montant dû — ces clés n'existaient pas encore.
   * La route doit rendre ces fiches, pas s'effondrer dessus, et surtout ne rien inventer.
   */
  describe('getOne — snapshot d’activation antérieur à D-028', () => {
    const LEGACY = {
      ...BASE,
      activationSnapshot: {
        tierBv: 1000,
        packName: 'Silver',
        weeklyCapBv: 10000,
        directCommissionBv: 500,
        indirectCommissionBv: 250,
      },
    };

    it('rend la fiche sans lever, en ne retenant que ce qui a été réellement figé', async () => {
      prisma.member.findUnique.mockResolvedValue(LEGACY);

      const detail = await service.getOne(42);

      expect(detail.activationSnapshot).toEqual({
        packName: 'Silver',
        tierBv: 1000,
        priceDt: null,
        registrationCreditDt: null,
        amountDueDt: null,
        directCommissionDt: null,
        indirectCommissionDt: null,
        weeklyCapDt: null,
      });
    });

    it('ne CONVERTIT jamais un montant `…Bv` en dinars — aucun taux points↔dinars n’existe', async () => {
      prisma.member.findUnique.mockResolvedValue(LEGACY);

      const detail = await service.getOne(42);

      // 10000 « BV » ne devient pas 10000 DT : ce serait exactement la conversion que D-028
      // interdit. L'absence est la seule réponse juste.
      expect(detail.activationSnapshot?.weeklyCapDt).toBeNull();
      expect(detail.activationSnapshot?.directCommissionDt).toBeNull();
      expect(detail.activationSnapshot?.indirectCommissionDt).toBeNull();
    });

    it('un snapshot de forme inattendue ne casse pas la route', async () => {
      prisma.member.findUnique.mockResolvedValue({
        ...BASE,
        activationSnapshot: 'ceci n’est pas un objet',
      });

      await expect(service.getOne(42)).resolves.toMatchObject({
        activationSnapshot: null,
      });
    });

    it('un snapshot complet sort intact (aucune régression sur le cas nominal)', async () => {
      prisma.member.findUnique.mockResolvedValue({
        ...BASE,
        activationSnapshot: {
          packName: 'Silver',
          tierBv: 1000,
          priceDt: '2200.000',
          registrationCreditDt: '100.000',
          amountDueDt: '2100.000',
          directCommissionDt: '500.000',
          indirectCommissionDt: '250.000',
          weeklyCapDt: '10000.000',
        },
      });

      const detail = await service.getOne(42);

      expect(detail.activationSnapshot).toEqual({
        packName: 'Silver',
        tierBv: 1000,
        priceDt: '2200.000',
        registrationCreditDt: '100.000',
        amountDueDt: '2100.000',
        directCommissionDt: '500.000',
        indirectCommissionDt: '250.000',
        weeklyCapDt: '10000.000',
      });
    });
  });

  describe('getIdDocumentPath', () => {
    it('ne lit QUE la colonne du chemin', async () => {
      prisma.member.findUnique.mockResolvedValue({ idDocumentPath: 'a/b.jpg' });

      await expect(service.getIdDocumentPath(42)).resolves.toBe('a/b.jpg');
      expect(prisma.member.findUnique.mock.calls[0][0].select).toEqual({
        idDocumentPath: true,
      });
    });

    it('membre inconnu : 404 (et non « pas de document »)', async () => {
      prisma.member.findUnique.mockResolvedValue(null);

      await expect(service.getIdDocumentPath(404)).rejects.toBeInstanceOf(
        MemberNotFoundError,
      );
    });
  });
});
