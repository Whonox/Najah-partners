import { Module } from '@nestjs/common';
import { CommissionsModule } from '../commissions/commissions.module';
import { EcardsModule } from '../ecards/ecards.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ActivationService } from './activation.service';
import { IdentityDocumentService } from './identity-document.service';
import { IdentityVerificationService } from './identity-verification.service';
import { MemberCodeService } from './member-code.service';
import { MembersAdminController } from './members-admin.controller';
import { MembersAdminService } from './members-admin.service';
import { MembersController } from './members.controller';
import { MembersPortalController } from './members-portal.controller';
import { MembersPortalService } from './members-portal.service';
import { MembersFacade } from './members.facade';
import { MembersService } from './members.service';
import { OnboardingController } from './onboarding/onboarding.controller';
import { OnboardingService } from './onboarding/onboarding.service';
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
    MembersPortalController,
    MembersAdminController,
    RenewalsAdminController,
    // Parcours de première connexion (T9.5, D-050) : la SEULE surface membre ouverte tant
    // que le parcours n'est pas terminé — sans quoi il faudrait l'avoir fini pour le commencer.
    OnboardingController,
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
    // Lecture seule pour le back-office (T8b) : ne participe à aucune transaction métier.
    MembersAdminService,
    // Verdict de vérification d'identité (T8c) : n'écrit que des colonnes documentaires — la
    // vérification reste NON BLOQUANTE (D-018).
    IdentityVerificationService,
    // Surface AFFILIÉ (T9) : lecture de MON espace, plus profil et mot de passe. Ne participe
    // à aucune transaction métier — le portail affiche et déclenche, il ne calcule rien.
    MembersPortalService,
    // Parcours de première connexion (T9.5, D-050) : dépôt de la pièce, questions secrètes,
    // PIN. N'écrit que des colonnes d'accès — aucune surface métier, aucun montant.
    OnboardingService,
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
