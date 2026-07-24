import { Module } from '@nestjs/common';
import { CommissionsModule } from '../commissions/commissions.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ActivationService } from './activation.service';
import { IdentityDocumentService } from './identity-document.service';
import { MemberCodeService } from './member-code.service';
import { MembersAdminController } from './members-admin.controller';
import { MembersController } from './members.controller';
import { MembersFacade } from './members.facade';
import { MembersService } from './members.service';
import { BalanceActivationPayment } from './payment/balance-activation-payment';
import { PlacementService } from './placement.service';
import { RenewalService } from './renewal.service';

/**
 * Inscription, placement, arbre binaire (Tranche 4). `LedgerModule` est importé pour le
 * débit d'activation : aucune écriture de solde ne se fait ailleurs que dans le grand livre.
 * `CommissionsModule` fournit le temps 1 du moteur (D-035) : l'activation écrit les
 * événements de commission dans sa propre transaction.
 * Les services sont exportés — le seed, les e-cards (T5) et le checkout (T6) s'appuient dessus.
 */
@Module({
  imports: [LedgerModule, CommissionsModule],
  controllers: [MembersController, MembersAdminController],
  providers: [
    MembersService,
    ActivationService,
    PlacementService,
    MemberCodeService,
    IdentityDocumentService,
    MembersFacade,
    BalanceActivationPayment,
    RenewalService,
  ],
  exports: [
    MembersService,
    ActivationService,
    PlacementService,
    MemberCodeService,
    RenewalService,
  ],
})
export class MembersModule {}
