import { Module } from '@nestjs/common';
import { PacksAdminController } from './packs-admin.controller';
import { PacksController } from './packs.controller';
import { PacksService } from './packs.service';

/**
 * Packs (spec §7.2.4, Tranche 8b). Module volontairement NU : il n'importe rien et ne dépend
 * de personne — un pack est une table de paramètres, pas un acteur du domaine.
 *
 * Il ne participe donc à aucune transaction métier : l'activation ne l'appelle pas, elle LIT
 * `Pack` une fois pour en figer le snapshot (`ActivationService`), après quoi le moteur de
 * commissions ne travaille plus que sur ce snapshot. C'est cette absence de lien qui garantit
 * que modifier un pack ne peut rien réécrire.
 */
@Module({
  controllers: [PacksAdminController, PacksController],
  providers: [PacksService],
  exports: [PacksService],
})
export class PacksModule {}
