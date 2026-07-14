import { Module } from '@nestjs/common';
import { BvLedgerModule } from '../bv-ledger/bv-ledger.module';
import { ActivationService } from './activation.service';
import { IdentityDocumentService } from './identity-document.service';
import { MemberCodeService } from './member-code.service';
import { MembersAdminController } from './members-admin.controller';
import { MembersController } from './members.controller';
import { MembersFacade } from './members.facade';
import { MembersService } from './members.service';
import { BalanceActivationPayment } from './payment/balance-activation-payment';
import { PlacementService } from './placement.service';

/**
 * Inscription, placement, arbre binaire (Tranche 4). `BvLedgerModule` est importé pour le
 * débit d'activation : aucune écriture de solde ne se fait ailleurs que dans le grand livre.
 * Les services sont exportés — le seed, les e-cards (T5) et le checkout (T6) s'appuient dessus.
 */
@Module({
  imports: [BvLedgerModule],
  controllers: [MembersController, MembersAdminController],
  providers: [
    MembersService,
    ActivationService,
    PlacementService,
    MemberCodeService,
    IdentityDocumentService,
    MembersFacade,
    BalanceActivationPayment,
  ],
  exports: [MembersService, ActivationService, PlacementService, MemberCodeService],
})
export class MembersModule {}
