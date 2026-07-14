import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BvMovementType,
  EcardStatus,
  Leg,
  MemberStatus,
  Prisma,
} from '@prisma/client';
import { InsufficientBalanceError } from '../bv-ledger/bv-ledger.errors';
import { BvLedgerService } from '../bv-ledger/bv-ledger.service';
import { ActivationService } from '../members/activation.service';
import { MemberCodeService } from '../members/member-code.service';
import { MembersService } from '../members/members.service';
import { ActivationPayment } from '../members/members.types';
import { BalanceActivationPayment } from '../members/payment/balance-activation-payment';
import { PlacementService } from '../members/placement.service';
import { PrismaService } from '../prisma/prisma.service';
import { EcardNotActiveError, EcardValueMismatchError } from './ecards.errors';
import { EcardsService } from './ecards.service';

/**
 * E-cards contre un VRAI Postgres (docker-compose, 5433). C'est ici — et nulle part
 * ailleurs — que sont vérifiées l'ATOMICITÉ de la consommation (rollback), la CONCURRENCE
 * (deux consommations de la même carte) et la CONSERVATION de la masse BV.
 * Lancés par `npm run test:int`.
 */

jest.setTimeout(60_000);

const DAY_MS = 86_400_000;
const EXPIRATION_SETTING = 'ecard_expiration_days';

describe('E-cards — intégration (vrai Postgres)', () => {
  let prisma: PrismaService;
  let ledger: BvLedgerService;
  let members: MembersService;
  let activation: ActivationService;
  let ecards: EcardsService;
  let packId: number;
  let tierBv: number;
  let adminId: number;

  const createdMembers: number[] = [];
  const createdEcards: number[] = [];
  let seq = 0;

  /** Racine isolée : chaque test travaille dans son propre arbre. */
  async function createRoot(): Promise<{ id: number; memberCode: string }> {
    seq += 1;
    const member = await prisma.$transaction(async (tx) => {
      const memberCode = await new MemberCodeService().allocate(tx);
      return tx.member.create({
        data: {
          memberCode,
          lastName: 'Racine',
          firstName: `E${seq}`,
          email: `ecard-root-${Date.now()}-${seq}@test.local`,
          passwordHash: 'x',
          status: MemberStatus.REGISTERED,
        },
        select: { id: true, memberCode: true },
      });
    });
    createdMembers.push(member.id);
    return member;
  }

  async function register(uplineCode: string, leg: Leg) {
    seq += 1;
    const member = await members.register({
      lastName: 'Test',
      firstName: `E${seq}`,
      email: `ecard-${Date.now()}-${seq}@test.local`,
      password: 'MotDePasse123!',
      sponsorCode: uplineCode,
      uplineCode,
      leg,
    });
    createdMembers.push(member.id);
    return member;
  }

  /** Crédite un solde par genèse admin (grand livre, T3) — la seule façon d'avoir du BV au départ. */
  async function fund(memberId: number, amountBv: number) {
    await ledger.recordMovement({
      memberId,
      type: BvMovementType.ADMIN_GENESIS,
      amountBv,
      reason: 'Test e-card',
    });
  }

  async function createEcard(creatorId: number, valueBv: number) {
    const ecard = await ecards.create({ creatorId, valueBv });
    createdEcards.push(ecard.id);
    return ecard;
  }

  async function balance(memberId: number): Promise<number> {
    const member = await prisma.member.findUniqueOrThrow({
      where: { id: memberId },
      select: { bvBalance: true },
    });
    return member.bvBalance;
  }

  async function movements(memberId: number) {
    return prisma.bvLedgerEntry.findMany({
      where: { memberId },
      orderBy: { id: 'asc' },
      select: { type: true, amountBv: true, balanceAfter: true, ecardId: true },
    });
  }

  async function ecardRow(id: number) {
    return prisma.ecard.findUniqueOrThrow({ where: { id } });
  }

  /** Force l'échéance dans le passé : attendre 180 jours n'est pas une option de test. */
  async function backdateExpiry(ecardId: number, daysAgo: number) {
    await prisma.ecard.update({
      where: { id: ecardId },
      data: { expiresAt: new Date(Date.now() - daysAgo * DAY_MS) },
    });
  }

  async function setExpirationSetting(value: string) {
    await prisma.setting.upsert({
      where: { key: EXPIRATION_SETTING },
      update: { value },
      create: { key: EXPIRATION_SETTING, value },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const config = {
      get: jest.fn((key: string, def?: string) =>
        key === 'BCRYPT_ROUNDS' ? '4' : def,
      ),
    } as unknown as ConfigService;

    ledger = new BvLedgerService(prisma);
    const placement = new PlacementService(prisma);
    members = new MembersService(
      prisma,
      config,
      placement,
      new MemberCodeService(),
    );
    activation = new ActivationService(
      prisma,
      placement,
      new BalanceActivationPayment(ledger),
    );
    ecards = new EcardsService(prisma, ledger);

    const pack = await prisma.pack.findFirstOrThrow({
      where: { name: 'Silver' },
    });
    packId = pack.id;
    tierBv = pack.tierBv;

    const admin = await prisma.adminUser.findFirstOrThrow();
    adminId = admin.id;
  });

  beforeEach(async () => {
    await setExpirationSetting('180');
  });

  afterEach(async () => {
    const ecardIds = [...createdEcards];
    const memberIds = [...createdMembers].reverse();
    createdEcards.length = 0;
    createdMembers.length = 0;

    // Ordre de suppression imposé par les FK : mouvements → e-cards → membres (Restrict
    // partout : ni le placement ni le créancier d'une e-card ne s'effacent en silence).
    if (memberIds.length > 0) {
      await prisma.bvLedgerEntry.deleteMany({
        where: { memberId: { in: memberIds } },
      });
    }
    if (ecardIds.length > 0) {
      await prisma.bvLedgerEntry.deleteMany({
        where: { ecardId: { in: ecardIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { target: { in: ecardIds.map((id) => `Ecard:${id}`) } },
      });
      await prisma.ecard.deleteMany({ where: { id: { in: ecardIds } } });
    }
    if (memberIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { target: { in: memberIds.map((id) => `Member:${id}`) } },
      });
      for (const id of memberIds) {
        await prisma.member.delete({ where: { id } });
      }
    }
  });

  afterAll(async () => {
    await setExpirationSetting('180');
    await prisma.$disconnect();
  });

  // ─────────────────────────── Création ───────────────────────────

  it('création : débit EXACT du créateur, e-card ACTIVE, mouvement rattaché à la carte', async () => {
    const creator = await createRoot();
    await fund(creator.id, 3000);

    const ecard = await createEcard(creator.id, 1000);

    expect(ecard.status).toBe(EcardStatus.ACTIVE);
    expect(ecard.code).toMatch(/^[A-HJ-NP-Z2-9]{3}(-[A-HJ-NP-Z2-9]{3}){3}$/);
    expect(await balance(creator.id)).toBe(2000); // 3000 − 1000, une seule fois

    const entries = await movements(creator.id);
    expect(entries).toEqual([
      expect.objectContaining({
        type: BvMovementType.ADMIN_GENESIS,
        amountBv: 3000,
      }),
      expect.objectContaining({
        type: BvMovementType.ECARD_CREATION,
        amountBv: -1000,
        balanceAfter: 2000,
        ecardId: ecard.id,
      }),
    ]);
  });

  it('création > solde → REFUSÉE : aucune e-card, aucun mouvement (invariant solde ≥ 0)', async () => {
    const creator = await createRoot();
    await fund(creator.id, 500);

    await expect(
      ecards.create({ creatorId: creator.id, valueBv: 1000 }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);

    expect(await balance(creator.id)).toBe(500);
    expect(await prisma.ecard.count({ where: { creatorId: creator.id } })).toBe(
      0,
    );
    expect(await movements(creator.id)).toHaveLength(1); // la seule genèse
  });

  it('paramètre -1 → e-card sans échéance ; 180 → échéance à +180 j', async () => {
    const creator = await createRoot();
    await fund(creator.id, 4000);

    await setExpirationSetting('-1');
    const unlimited = await createEcard(creator.id, 1000);
    expect(unlimited.expiresAt).toBeNull();

    await setExpirationSetting('180');
    const limited = await createEcard(creator.id, 1000);
    const days = (limited.expiresAt!.getTime() - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(179);
    expect(days).toBeLessThan(181);
  });

  // ─────────────────────────── Consommation à l'activation ───────────────────────────

  it('valeur = palier → e-card USED, membre ACTIF, arbre crédité, AUCUN BV crédité au bénéficiaire', async () => {
    const root = await createRoot();
    const creator = await createRoot();
    const newcomer = await register(root.memberCode, Leg.LEFT);

    await fund(creator.id, tierBv);
    const ecard = await createEcard(creator.id, tierBv);

    const result = await activation.activate({
      memberId: newcomer.id,
      packId,
      payment: ecards.activationPayment(ecard.code),
    });

    // La carte est brûlée, définitivement, au profit du membre activé.
    const burned = await ecardRow(ecard.id);
    expect(burned.status).toBe(EcardStatus.USED);
    expect(burned.userId).toBe(newcomer.id);
    expect(burned.usedAt).not.toBeNull();

    // L'activation a bien eu lieu…
    const member = await prisma.member.findUniqueOrThrow({
      where: { id: newcomer.id },
    });
    expect(member.status).toBe(MemberStatus.ACTIVE);
    expect(member.activationTierBv).toBe(tierBv);
    const upline = await prisma.member.findUniqueOrThrow({
      where: { id: root.id },
    });
    expect(upline.leftPoints).toBe(tierBv); // le palier est monté dans l'arbre

    // …SANS que le bénéficiaire soit crédité : l'e-card paie, elle ne recharge pas (D-025).
    expect(await balance(newcomer.id)).toBe(0);
    expect(await movements(newcomer.id)).toHaveLength(0);
    expect(result.payment).toEqual({
      method: 'ECARD',
      ledgerEntryId: null,
      ecardId: ecard.id,
    });
  });

  it('valeur ≠ palier → REFUSÉE : e-card intacte (ACTIVE), membre toujours INSCRIT', async () => {
    const root = await createRoot();
    const creator = await createRoot();
    const newcomer = await register(root.memberCode, Leg.LEFT);

    await fund(creator.id, tierBv + 500);
    const ecard = await createEcard(creator.id, tierBv + 500); // trop-perçu : interdit

    await expect(
      activation.activate({
        memberId: newcomer.id,
        packId,
        payment: ecards.activationPayment(ecard.code),
      }),
    ).rejects.toBeInstanceOf(EcardValueMismatchError);

    expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.ACTIVE);
    const member = await prisma.member.findUniqueOrThrow({
      where: { id: newcomer.id },
    });
    expect(member.status).toBe(MemberStatus.REGISTERED);
    const upline = await prisma.member.findUniqueOrThrow({
      where: { id: root.id },
    });
    expect(upline.leftPoints).toBe(0); // rien n'est monté dans l'arbre
  });

  it('e-card USED → non réutilisable (une utilisation est définitive et irréversible)', async () => {
    const root = await createRoot();
    const creator = await createRoot();
    const first = await register(root.memberCode, Leg.LEFT);
    const second = await register(root.memberCode, Leg.RIGHT);

    await fund(creator.id, tierBv);
    const ecard = await createEcard(creator.id, tierBv);

    await activation.activate({
      memberId: first.id,
      packId,
      payment: ecards.activationPayment(ecard.code),
    });

    await expect(
      activation.activate({
        memberId: second.id,
        packId,
        payment: ecards.activationPayment(ecard.code),
      }),
    ).rejects.toBeInstanceOf(EcardNotActiveError);

    const member = await prisma.member.findUniqueOrThrow({
      where: { id: second.id },
    });
    expect(member.status).toBe(MemberStatus.REGISTERED);
  });

  it('activation interrompue APRÈS la consommation → rollback : l’e-card reste ACTIVE, aucun mouvement orphelin', async () => {
    const root = await createRoot();
    const creator = await createRoot();
    const newcomer = await register(root.memberCode, Leg.LEFT);

    await fund(creator.id, tierBv);
    const ecard = await createEcard(creator.id, tierBv);

    // La carte est RÉELLEMENT brûlée dans la transaction, puis l'activation échoue juste
    // après : c'est le cas qui compte (une panne au milieu du checkout). Seul le rollback
    // Postgres peut rendre la carte — aucune compensation applicative n'est écrite.
    const crashing: ActivationPayment = {
      settleInTx: async (tx, input) => {
        const consumed = await ecards.consumeInTx(tx, {
          code: ecard.code,
          memberId: input.memberId,
          dueBv: input.amountBv,
        });
        expect(consumed.ecardId).toBe(ecard.id); // la consommation a bien eu lieu…
        throw new Error('panne simulée après consommation');
      },
    };

    await expect(
      activation.activate({ memberId: newcomer.id, packId, payment: crashing }),
    ).rejects.toThrow('panne simulée');

    // …et pourtant rien n'a survécu au rollback.
    const untouched = await ecardRow(ecard.id);
    expect(untouched.status).toBe(EcardStatus.ACTIVE);
    expect(untouched.usedAt).toBeNull();
    expect(untouched.userId).toBeNull();

    const member = await prisma.member.findUniqueOrThrow({
      where: { id: newcomer.id },
    });
    expect(member.status).toBe(MemberStatus.REGISTERED);
    expect(member.activationTierBv).toBeNull();
    expect(await movements(newcomer.id)).toHaveLength(0);
    const upline = await prisma.member.findUniqueOrThrow({
      where: { id: root.id },
    });
    expect(upline.leftPoints).toBe(0);
  });

  it('CONCURRENCE : deux activations sur la MÊME e-card → exactement une réussit', async () => {
    const root = await createRoot();
    const creator = await createRoot();
    const left = await register(root.memberCode, Leg.LEFT);
    const right = await register(root.memberCode, Leg.RIGHT);

    await fund(creator.id, tierBv);
    const ecard = await createEcard(creator.id, tierBv);

    // Deux membres distincts (donc aucune sérialisation « gratuite » par le verrou du membre)
    // tentent de payer avec la même carte, en même temps. L'UPDATE gardé les sérialise sur le
    // verrou de ligne de l'e-card : la perdante relit `status = USED` et est annulée.
    const outcomes = await Promise.allSettled([
      activation.activate({
        memberId: left.id,
        packId,
        payment: ecards.activationPayment(ecard.code),
      }),
      activation.activate({
        memberId: right.id,
        packId,
        payment: ecards.activationPayment(ecard.code),
      }),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    // La perdante doit échouer SUR L'E-CARD (409), pas sur un timeout de verrou ni un
    // interblocage : sinon le test passerait pour de mauvaises raisons, et masquerait
    // une sérialisation obtenue par accident plutôt que par l'UPDATE gardé.
    const rejected = outcomes.find((o) => o.status === 'rejected');
    expect(rejected!.reason).toBeInstanceOf(HttpException);
    expect((rejected!.reason as HttpException).getStatus()).toBe(409);

    expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.USED);

    // Un seul des deux membres est ACTIF : la carte n'a payé qu'une activation.
    const statuses = await prisma.member.findMany({
      where: { id: { in: [left.id, right.id] } },
      select: { status: true },
    });
    expect(
      statuses.filter((m) => m.status === MemberStatus.ACTIVE),
    ).toHaveLength(1);

    // Et l'arbre n'a reçu le palier qu'UNE fois (une double propagation serait une
    // corruption comptable : du BV réseau créé à partir d'une seule e-card).
    const upline = await prisma.member.findUniqueOrThrow({
      where: { id: root.id },
    });
    expect(upline.leftPoints + upline.rightPoints).toBe(tierBv);
  });

  // ─────────────────────────── Conservation de la masse BV ───────────────────────────

  it('CONSERVATION : création → consommation ne fait apparaître ni disparaître de BV', async () => {
    const root = await createRoot();
    const creator = await createRoot();
    const newcomer = await register(root.memberCode, Leg.LEFT);

    await fund(creator.id, tierBv); // seul BV injecté dans le système : +1000
    const ecard = await createEcard(creator.id, tierBv);
    await activation.activate({
      memberId: newcomer.id,
      packId,
      payment: ecards.activationPayment(ecard.code),
    });

    // Créateur : +1000 (genèse) −1000 (émission) = 0. Il a vendu sa carte hors plateforme.
    const creatorEntries = await movements(creator.id);
    expect(creatorEntries.map((e) => e.amountBv)).toEqual([tierBv, -tierBv]);
    expect(await balance(creator.id)).toBe(0);
    // Somme des mouvements = solde courant (invariant du grand livre).
    expect(creatorEntries.reduce((sum, e) => sum + e.amountBv, 0)).toBe(
      await balance(creator.id),
    );

    // Bénéficiaire : AUCUN mouvement. La valeur de la carte a payé le palier, elle n'a
    // jamais transité par son solde.
    expect(await movements(newcomer.id)).toHaveLength(0);
    expect(await balance(newcomer.id)).toBe(0);

    // Bilan : 1000 BV créés par la genèse, 1000 BV consommés en payant l'activation.
    // Aucun solde ne les porte encore — et rien n'a été inventé en chemin.
    const allEntries = await prisma.bvLedgerEntry.findMany({
      where: { ecardId: ecard.id },
    });
    expect(allEntries).toHaveLength(1); // la seule création ; la consommation n'écrit rien
    expect(allEntries[0].type).toBe(BvMovementType.ECARD_CREATION);
  });

  // ─────────────────────────── Expiration (cron) ───────────────────────────

  it('cron : e-card échue → EXPIRED et créateur RECRÉDITÉ du montant exact', async () => {
    const creator = await createRoot();
    await fund(creator.id, 1000);
    const ecard = await createEcard(creator.id, 1000);
    expect(await balance(creator.id)).toBe(0);

    await backdateExpiry(ecard.id, 1);
    const sweep = await ecards.expireDue();

    expect(sweep.expired).toBeGreaterThanOrEqual(1);
    const expired = await ecardRow(ecard.id);
    expect(expired.status).toBe(EcardStatus.EXPIRED);
    expect(expired.closedAt).not.toBeNull();

    expect(await balance(creator.id)).toBe(1000); // le BV lui revient
    const entries = await movements(creator.id);
    expect(entries[entries.length - 1]).toMatchObject({
      type: BvMovementType.ECARD_REFUND,
      amountBv: 1000,
      balanceAfter: 1000,
      ecardId: ecard.id,
    });
  });

  it('cron : e-card EXPIRED n’est ni reconsommable ni remboursée deux fois', async () => {
    const creator = await createRoot();
    await fund(creator.id, 1000);
    const ecard = await createEcard(creator.id, 1000);

    await backdateExpiry(ecard.id, 1);
    await ecards.expireDue();
    await ecards.expireDue(); // second passage : la carte n'est plus ACTIVE

    expect(await balance(creator.id)).toBe(1000); // remboursée UNE fois
    expect(
      (await movements(creator.id)).filter(
        (e) => e.type === BvMovementType.ECARD_REFUND,
      ),
    ).toHaveLength(1);
  });

  it('cron : e-card illimitée (-1) → jamais expirée, jamais remboursée', async () => {
    const creator = await createRoot();
    await fund(creator.id, 1000);

    await setExpirationSetting('-1');
    const ecard = await createEcard(creator.id, 1000);
    expect(ecard.expiresAt).toBeNull();

    await ecards.expireDue(new Date(Date.now() + 3650 * DAY_MS)); // dix ans plus tard

    expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.ACTIVE);
    expect(await balance(creator.id)).toBe(0); // toujours pas remboursé : la carte vit
  });

  it('cron : e-card de GENÈSE échue → EXPIRED sans rembourser personne', async () => {
    const ecard = await ecards.genesis({ adminId, valueBv: 1000 });
    createdEcards.push(ecard.id);

    await backdateExpiry(ecard.id, 1);
    await ecards.expireDue();

    const expired = await ecardRow(ecard.id);
    expect(expired.status).toBe(EcardStatus.EXPIRED);
    // Aucun créancier : la valeur disparaît comme elle est apparue. Créditer qui que ce
    // soit ici fabriquerait du BV.
    expect(
      await prisma.bvLedgerEntry.count({ where: { ecardId: ecard.id } }),
    ).toBe(0);
  });

  // ─────────────────────────── Révocation ───────────────────────────

  it('révocation admin : REVOKED + créateur remboursé, dans la même transaction', async () => {
    const creator = await createRoot();
    await fund(creator.id, 1000);
    const ecard = await createEcard(creator.id, 1000);
    expect(await balance(creator.id)).toBe(0);

    const revoked = await ecards.revoke({
      ecardId: ecard.id,
      adminId,
      reason: 'Litige hors plateforme',
    });

    expect(revoked.status).toBe(EcardStatus.REVOKED);
    expect(await balance(creator.id)).toBe(1000);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'ECARD_REVOKED', target: `Ecard:${ecard.id}` },
    });
    expect(audit).not.toBeNull();
    // Un code est de la valeur au porteur : il ne doit jamais atterrir dans un journal.
    expect(JSON.stringify(audit)).not.toContain(ecard.code);
  });

  it('révocation d’une e-card déjà USED → refusée (USED est définitif)', async () => {
    const root = await createRoot();
    const creator = await createRoot();
    const newcomer = await register(root.memberCode, Leg.LEFT);

    await fund(creator.id, tierBv);
    const ecard = await createEcard(creator.id, tierBv);
    await activation.activate({
      memberId: newcomer.id,
      packId,
      payment: ecards.activationPayment(ecard.code),
    });

    await expect(
      ecards.revoke({ ecardId: ecard.id, adminId }),
    ).rejects.toBeInstanceOf(EcardNotActiveError);

    // Le membre reste ACTIF et le créateur n'est pas remboursé : rien n'est réécrit.
    expect(await balance(creator.id)).toBe(0);
  });

  // ─────────────────────────── Genèse ───────────────────────────

  it('genèse : e-card sans créateur, aucun solde débité, activable comme une autre', async () => {
    const root = await createRoot();
    const newcomer = await register(root.memberCode, Leg.LEFT);

    const ecard = await ecards.genesis({
      adminId,
      valueBv: tierBv,
      reason: 'Amorçage',
    });
    createdEcards.push(ecard.id);

    const row = await ecardRow(ecard.id);
    expect(row.creatorId).toBeNull();
    expect(row.createdByAdminId).toBe(adminId);
    expect(
      await prisma.bvLedgerEntry.count({ where: { ecardId: ecard.id } }),
    ).toBe(0);

    await activation.activate({
      memberId: newcomer.id,
      packId,
      payment: ecards.activationPayment(ecard.code),
    });

    expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.USED);
    const member = await prisma.member.findUniqueOrThrow({
      where: { id: newcomer.id },
    });
    expect(member.status).toBe(MemberStatus.ACTIVE);
    expect(await balance(newcomer.id)).toBe(0); // toujours aucune recharge
  });

  it('le CHECK en base interdit une e-card MEMBER sans créateur (BV sans créancier)', async () => {
    // Garde-fou de dernier recours : même un INSERT direct ne peut pas fabriquer une e-card
    // MEMBER orpheline, qui ne saurait plus qui rembourser à son expiration.
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Ecard" ("code", "valueBv", "status", "origin", "creatorId")
        VALUES ('ZZZ-ZZZ-ZZZ-ZZZ', 1000, 'ACTIVE'::"EcardStatus", 'MEMBER'::"EcardOrigin", NULL)
      `,
    ).rejects.toThrow(/Ecard_origin_creator_ck/);
  });

  // ─────────────────────────── Vérification ───────────────────────────

  it('vérification : valide + valeur, SANS consommer ; échue → invalide', async () => {
    const creator = await createRoot();
    await fund(creator.id, 2000);
    const ecard = await createEcard(creator.id, 1000);

    const check = await ecards.verify(ecard.code.toLowerCase()); // saisie en minuscules
    expect(check).toMatchObject({ valid: true, valueBv: 1000, reason: null });
    expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.ACTIVE); // non consommée

    await backdateExpiry(ecard.id, 1);
    const stale = await ecards.verify(ecard.code);
    // L'échéance fait foi, même avant le passage du cron : on ne laisse jamais quelqu'un
    // partir en checkout avec une carte morte.
    expect(stale).toMatchObject({ valid: false, reason: 'EXPIRED' });
  });
});
