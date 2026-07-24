import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Money, isValidMoney, money } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { InvalidMembershipFeeSettingError } from './members.errors';

/** Frais d'inscription, en DT (D-036). Acompte sur le pack à l'activation (D-037). */
export const REGISTRATION_FEE_SETTING = 'registration_fee_dt';
/** Renouvellement annuel, en DT (D-038). */
export const ANNUAL_RENEWAL_SETTING = 'annual_renewal_dt';

/**
 * Lecture des montants d'adhésion paramétrables (spec §5.3, §5.9).
 *
 * Ces montants sont PARAMÉTRABLES mais jamais relus après coup : chaque paiement fige le sien
 * (`MembershipPayment.amountDt`, `Member.registrationPaidDt`). Changer le tarif demain ne
 * réécrit donc aucun acompte déjà versé — c'est l'invariant de snapshot du projet (spec §5.8),
 * appliqué ici comme il l'est au pack à l'activation.
 *
 * Un paramètre absent ou corrompu lève une 500 plutôt que de facturer un montant faux : « sans
 * e-card valide, pas d'inscription » (D-036) suppose qu'on sache ce qu'il faut encaisser.
 */
@Injectable()
export class MembershipFeeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `client` permet de lire DANS la transaction appelante : le montant facturé et les cartes
   * brûlées viennent alors du même instantané de la base.
   */
  async read(
    key: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Money> {
    const setting = await client.setting.findUnique({ where: { key } });
    if (!setting) {
      throw new InvalidMembershipFeeSettingError(key, null);
    }

    let amount: Money;
    try {
      amount = money(setting.value);
    } catch {
      throw new InvalidMembershipFeeSettingError(key, setting.value);
    }
    // Strictement positif : une adhésion gratuite n'existe pas (D-036), et un montant plus fin
    // que le millime serait arrondi en silence par Postgres.
    if (!isValidMoney(amount) || amount.lessThanOrEqualTo(0)) {
      throw new InvalidMembershipFeeSettingError(key, setting.value);
    }
    return amount;
  }
}
