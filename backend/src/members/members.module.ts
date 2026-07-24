import { Module } from '@nestjs/common';
import { CommissionsModule } from '../commissions/commissions.module';
import { EcardsModule } from '../ecards/ecards.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ActivationService } from './activation.service';
import { IdentityDocumentService } from './identity-document.service';
import { MemberCodeService } from './member-code.service';
import { MembersAdminController } from './members-admin.controller';
import { MembersController } from './members.controller';
import { MembersFacade } from './members.facade';
import { MembersService } from './members.service';
import { MembershipFeeService } from './membership-fee.service';
import { BalanceActivationPayment } from './payment/balance-activation-payment';
import { PlacementService } from './placement.service';
import { RenewalService } from './renewal.service';
import { RenewalsAdminController } from './renewals-admin.controller';

/**
 * Inscription, placement, arbre binaire (Tranche 4), renouvellement annuel (Tranche 7.5).
 *
 * `LedgerModule` : le débit d'activation sur solde — aucune écriture de solde ne se fait
 * ailleurs que dans le grand livre.
 * `CommissionsModule` : le temps 1 du moteur (D-035) — l'activation écrit les événements de
 * commission dans sa propre transaction.
 * `EcardsModule` (T7.5) : l'inscription et le renouvellement se règlent en e-cards (D-036,
 * D-038). La dépendance ne va que dans ce sens — `EcardsModule` n'importe rien de `members/`
 * (il n'en connaît qu'un TYPE, `ActivationPayment`), donc aucun cycle.
 *
 * Les services sont exportés — le seed, les e-cards (T5) et le checkout (T6) s'appuient dessus.
 */
@Module({
  imports: [LedgerModule, CommissionsModule, EcardsModule],
  controllers: [
    MembersController,
    MembersAdminController,
    RenewalsAdminController,
  ],
  providers: [
    MembersService,
    ActivationService,
    PlacementService,
    MemberCodeService,
    IdentityDocumentService,
    MembersFacade,
    BalanceActivationPayment,
    MembershipFeeService,
    RenewalService,
  ],
  exports: [
    MembersService,
    ActivationService,
    PlacementService,
    MemberCodeService,
    MembershipFeeService,
    RenewalService,
  ],
})
export class MembersModule {}
