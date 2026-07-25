import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZERO_DT, money, moneyToApi } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import {
  RunEventDto,
  RunMemberEventsDto,
} from './dto/commissions-response.dto';
import { SettleableEvent, settleWeek } from './settlement';

const MEMBER_REF_SELECT = {
  id: true,
  memberCode: true,
  firstName: true,
  lastName: true,
  status: true,
} satisfies Prisma.MemberSelect;

/**
 * « POURQUOI CE MONTANT ? » — la ventilation d'un règlement, événement par événement.
 *
 * SERVICE PARTAGÉ, ET C'EST TOUT L'ENJEU. La supervision admin (§7.2.7) et le portail affilié
 * (T9) posent exactement la même question ; y répondre deux fois, c'est garantir qu'un jour
 * l'affilié lira une explication et l'administration une autre — sur le même versement, sur la
 * même semaine. Il n'existe donc qu'UNE implémentation, ici, et les deux surfaces s'y branchent.
 *
 * UNE exception assumée à la règle « on ne recalcule rien » : la ventilation PAR ÉVÉNEMENT
 * (combien cet événement a-t-il réellement payé, combien a-t-il perdu au plafond) n'est pas
 * stockée — `Commission` n'en garde que l'agrégat. Elle est donc rejouée par `settleWeek`,
 * c'est-à-dire par LA fonction qu'a exécutée le run, sur les MÊMES entrées (les événements
 * réclamés par ce run, et le plafond figé dans `Commission.appliedCapDt`). Le résultat est donc
 * l'explication exacte du versement, et non une reconstitution approchée. Écrire ici une
 * seconde logique de plafond aurait garanti qu'un jour l'écran explique autre chose que ce qui
 * a été payé (D-047).
 */
@Injectable()
export class CommissionExplainService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * La chronologie d'un membre sur un run. L'ordre est celui de l'application du plafond,
   * `(occurredAt, id)` — le même qu'a suivi le run (D-033 : sur une même activation, DIRECT
   * avant BALANCE).
   */
  async memberEvents(
    runId: number,
    memberId: number,
  ): Promise<RunMemberEventsDto> {
    const [member, settlement, events] = await Promise.all([
      this.prisma.member.findUnique({
        where: { id: memberId },
        select: MEMBER_REF_SELECT,
      }),
      this.prisma.commission.findUnique({
        where: { memberId_runId: { memberId, runId } },
      }),
      this.prisma.commissionEvent.findMany({
        where: { runId, memberId },
        include: { sourceMember: { select: MEMBER_REF_SELECT } },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    if (!member) {
      throw new NotFoundException(`Membre inconnu : ${memberId}`);
    }
    if (events.length === 0) {
      throw new NotFoundException(
        `Aucun événement de commission pour le membre ${memberId} sur le run ${runId}.`,
      );
    }

    // Pas de règlement = tous les événements étaient inéligibles (le run passe le membre) :
    // le plafond n'a alors jamais eu à s'appliquer, et `settleWeek` le confirme en ne payant
    // rien. On lui passe donc un plafond nul, qui ne peut pas fabriquer un versement.
    const capDt = settlement ? money(settlement.appliedCapDt) : ZERO_DT;
    const settleable: SettleableEvent[] = events.map((event) => ({
      id: event.id,
      type: event.type,
      amountDt: money(event.amountDt),
      eligible: event.eligible,
      occurredAt: event.occurredAt,
    }));
    const replay = settleWeek(settleable, capDt);
    const lines = new Map(replay.lines.map((line) => [line.eventId, line]));

    const items: RunEventDto[] = events.map((event) => {
      const line = lines.get(event.id);
      const amount = money(event.amountDt);
      return {
        id: event.id,
        type: event.type,
        amountDt: moneyToApi(amount),
        occurredAt: event.occurredAt,
        sourceMember: event.sourceMember,
        eligible: event.eligible,
        balanceIndex: event.balanceIndex,
        cumulativeBeforeDt: moneyToApi(line?.cumulativeBeforeDt ?? ZERO_DT),
        paidDt: moneyToApi(line?.paidDt ?? ZERO_DT),
        // « Perdu » ne dit qu'une chose : perdu AU PLAFOND. Un événement inéligible affiche donc
        // 0 et non son montant — cette somme n'a jamais été due (D-034), et la compter comme
        // perdue casserait l'égalité « Σ perdu = brut − versé » du run. C'est l'indicateur
        // `eligible` qui porte l'information, et l'écran l'affiche en clair.
        lostDt: moneyToApi(line?.lostDt ?? ZERO_DT),
        crossesCap: line?.crossesCap ?? false,
        rewardPointGranted: line?.rewardPointGranted ?? false,
        rewardPointLost: line?.rewardPointLost ?? false,
      };
    });

    const gross = money(settlement?.grossDt ?? 0);
    const paid = money(settlement?.paidDt ?? 0);

    return {
      member,
      appliedCapDt: settlement ? moneyToApi(capDt) : null,
      grossDt: moneyToApi(gross),
      paidDt: moneyToApi(paid),
      lostDt: moneyToApi(gross.minus(paid)),
      events: items,
    };
  }
}
