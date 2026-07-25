import { BadRequestException } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityVerificationService } from './identity-verification.service';
import { MemberNotFoundError } from './members.errors';

/**
 * Ce que ces tests tiennent :
 *  — un REJET sans motif est refusé (le membre doit savoir quoi corriger) et une VALIDATION avec
 *    motif l'est aussi (un dossier accepté ne traîne pas de réserve) ;
 *  — valider EFFACE le motif d'un rejet antérieur ;
 *  — le verdict est tracé (qui, avant → après, et le numéro saisi qui a été comparé) ;
 *  — **l'invariant D-018** : l'écriture ne touche QUE les colonnes de vérification. Aucun
 *    `status`, aucun point, aucun solde, aucune échéance — la vérification ne bloque rien, et ce
 *    test échouerait si quelqu'un ajoutait un jour un effet de bord ici.
 */

const MEMBER = {
  id: 42,
  memberCode: 'NP000042',
  verificationStatus: VerificationStatus.PENDING,
  verificationReason: null,
  idDocumentType: null,
  idDocumentNumber: '01234567',
};

function prismaMock() {
  const tx = {
    member: {
      findUnique: jest.fn().mockResolvedValue(MEMBER),
      update: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  };
  return {
    tx,
    prisma: {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    },
  };
}

describe('IdentityVerificationService', () => {
  let mock: ReturnType<typeof prismaMock>;
  let service: IdentityVerificationService;

  beforeEach(() => {
    mock = prismaMock();
    service = new IdentityVerificationService(
      mock.prisma as unknown as PrismaService,
    );
    mock.tx.member.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: MEMBER.id,
          memberCode: MEMBER.memberCode,
          verificationStatus: data.verificationStatus,
          verificationReason: data.verificationReason,
          verificationAt: data.verificationAt,
          verificationByAdminId: data.verificationByAdminId,
          idDocumentType: null,
        }),
    );
  });

  it('refuse un REJET sans motif', async () => {
    await expect(
      service.decide({
        memberId: 42,
        adminId: 1,
        status: VerificationStatus.REJECTED,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(mock.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse un motif sur une VALIDATION (rien à justifier)', async () => {
    await expect(
      service.decide({
        memberId: 42,
        adminId: 1,
        status: VerificationStatus.VERIFIED,
        reason: 'tout va bien',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('un motif fait uniquement d’espaces vaut un motif absent', async () => {
    await expect(
      service.decide({
        memberId: 42,
        adminId: 1,
        status: VerificationStatus.REJECTED,
        reason: '   ',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejette avec motif : le motif est enregistré et l’audit porte le numéro comparé', async () => {
    const result = await service.decide({
      memberId: 42,
      adminId: 7,
      status: VerificationStatus.REJECTED,
      reason: '  Le numéro ne correspond pas à l’image.  ',
    });

    expect(result.verificationStatus).toBe(VerificationStatus.REJECTED);
    expect(result.verificationReason).toBe(
      'Le numéro ne correspond pas à l’image.',
    );
    expect(result.verificationByAdminId).toBe(7);

    const audit = mock.tx.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe('MEMBER_IDENTITY_VERIFICATION');
    expect(audit.actor).toBe('7');
    expect(audit.target).toBe('Member:42');
    expect(audit.before).toEqual({
      verificationStatus: VerificationStatus.PENDING,
      verificationReason: null,
    });
    // Le numéro SAISI est figé dans l'audit : le verdict reste rejugeable si le membre le corrige.
    expect(audit.after.idDocumentNumber).toBe('01234567');
  });

  it('valider EFFACE le motif d’un rejet antérieur', async () => {
    mock.tx.member.findUnique.mockResolvedValue({
      ...MEMBER,
      verificationStatus: VerificationStatus.REJECTED,
      verificationReason: 'ancien motif',
    });

    const result = await service.decide({
      memberId: 42,
      adminId: 1,
      status: VerificationStatus.VERIFIED,
    });

    expect(result.verificationStatus).toBe(VerificationStatus.VERIFIED);
    expect(result.verificationReason).toBeNull();
  });

  it('D-018 — n’écrit QUE les colonnes de vérification : rien qui bloque le membre', async () => {
    await service.decide({
      memberId: 42,
      adminId: 1,
      status: VerificationStatus.VERIFIED,
    });

    const written = Object.keys(mock.tx.member.update.mock.calls[0][0].data);
    expect(written.sort()).toEqual([
      'verificationAt',
      'verificationByAdminId',
      'verificationReason',
      'verificationStatus',
    ]);
    // Explicite, pour que l'intention survive à une relecture rapide : ces champs-là ne doivent
    // JAMAIS apparaître ici. Les toucher ferait de la vérification un blocage (D-018 l'interdit).
    for (const forbidden of [
      'status',
      'balanceDt',
      'renewalAt',
      'activatedAt',
      'carriedLeftPoints',
      'carriedRightPoints',
    ]) {
      expect(written).not.toContain(forbidden);
    }
  });

  it('membre inconnu : erreur de domaine, aucune écriture', async () => {
    mock.tx.member.findUnique.mockResolvedValue(null);
    await expect(
      service.decide({
        memberId: 999,
        adminId: 1,
        status: VerificationStatus.VERIFIED,
      }),
    ).rejects.toThrow(MemberNotFoundError);
    expect(mock.tx.member.update).not.toHaveBeenCalled();
  });
});
