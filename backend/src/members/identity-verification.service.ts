import { BadRequestException, Injectable } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VerificationResultDto } from './dto/verify-identity.dto';
import { MemberNotFoundError } from './members.errors';

/**
 * Verdict de vérification d'identité (D-018, D-039) — le module resté en attente depuis la
 * Tranche 4 : le filtre de lecture existait, l'écriture n'existait pas, si bien que la file
 * `PENDING` du back-office ne pouvait jamais se vider.
 *
 * ═══ L'INVARIANT LE PLUS IMPORTANT DE CE SERVICE EST CE QU'IL N'ÉCRIT PAS ═══
 * La vérification est NON BLOQUANTE. Ce service ne touche QUE les quatre colonnes de
 * vérification. Il ne change pas `status` (INSCRIT / ACTIF / INACTIF), ne touche ni les points,
 * ni le solde, ni l'éligibilité aux commissions, ni l'échéance de renouvellement. Un membre
 * REJECTED continue de s'inscrire, de s'activer, de percevoir et de renouveler exactement comme
 * un membre VERIFIED : le badge informe l'admin, il n'interdit rien. Le jour où une décision
 * cliente en fera un blocage, ce sera une décision métier écrite dans `docs/decisions.md` —
 * pas une ligne ajoutée discrètement ici.
 *
 * Aucun verrou de ligne `Member` n'est pris (D-024) : on écrit des colonnes que personne
 * d'autre ne lit ni n'écrit — ni l'activation, ni le moteur, ni le renouvellement. Il n'y a donc
 * aucune course à sérialiser, et prendre un verrou de chaîne ici pour une écriture purement
 * documentaire ferait attendre de vraies transactions financières.
 */
@Injectable()
export class IdentityVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async decide(params: {
    memberId: number;
    adminId: number;
    status: typeof VerificationStatus.VERIFIED | typeof VerificationStatus.REJECTED;
    reason?: string;
  }): Promise<VerificationResultDto> {
    const rejecting = params.status === VerificationStatus.REJECTED;
    const reason = params.reason?.trim();

    // Deux refus symétriques, imposés aussi par un CHECK en base : un rejet sans motif ne dit
    // pas au membre quoi corriger ; un motif sur une validation laisserait une critique
    // accrochée à un dossier accepté.
    if (rejecting && !reason) {
      throw new BadRequestException(
        'Un rejet de vérification exige un motif : le membre doit savoir quoi corriger.',
      );
    }
    if (!rejecting && reason) {
      throw new BadRequestException(
        'Une validation ne prend pas de motif : il n’y a rien à justifier.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.member.findUnique({
        where: { id: params.memberId },
        select: {
          id: true,
          memberCode: true,
          verificationStatus: true,
          verificationReason: true,
          idDocumentType: true,
          idDocumentNumber: true,
        },
      });
      if (!before) {
        throw new MemberNotFoundError(params.memberId);
      }

      const after = await tx.member.update({
        where: { id: params.memberId },
        data: {
          verificationStatus: params.status,
          // Effacé sur une validation : la contrainte de base l'exige, et un « vérifié » qui
          // traîne l'ancien motif de rejet se lirait comme une réserve toujours d'actualité.
          verificationReason: rejecting ? reason! : null,
          verificationAt: new Date(),
          verificationByAdminId: params.adminId,
        },
        select: {
          id: true,
          memberCode: true,
          verificationStatus: true,
          verificationReason: true,
          verificationAt: true,
          verificationByAdminId: true,
          idDocumentType: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actor: String(params.adminId),
          action: 'MEMBER_IDENTITY_VERIFICATION',
          target: `Member:${params.memberId}`,
          before: {
            verificationStatus: before.verificationStatus,
            verificationReason: before.verificationReason,
          },
          after: {
            verificationStatus: after.verificationStatus,
            verificationReason: after.verificationReason,
            // Le numéro SAISI est ce que l'admin a comparé à l'image (D-039) : le figer dans
            // l'audit permet de rejuger le verdict même si le membre corrige sa saisie ensuite.
            idDocumentNumber: before.idDocumentNumber,
          },
        },
      });

      return {
        memberId: after.id,
        memberCode: after.memberCode,
        verificationStatus: after.verificationStatus,
        verificationReason: after.verificationReason,
        verificationAt: after.verificationAt!,
        verificationByAdminId: after.verificationByAdminId!,
        idDocumentType: after.idDocumentType,
      };
    });
  }
}
