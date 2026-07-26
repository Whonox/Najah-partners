import { ApiProperty } from '@nestjs/swagger';
import { Leg, MemberStatus, VerificationStatus } from '@prisma/client';

/**
 * Ce que rend l'inscription (D-021, D-036).
 *
 * ═══ POURQUOI CE DTO EXISTE ═══
 * L'endpoint sortait sans schéma de réponse : le client généré le typait `{}`, et l'écran
 * d'inscription ne pouvait donc pas lire le CODE MEMBRE — la seule chose que le nouvel
 * affilié doive retenir, puisqu'aucun canal ne le lui enverra (D-011). Ajouté en Tranche 9.5,
 * quand un écran a enfin consommé cette route.
 *
 * ═══ CE QU'IL NE PORTE PAS ═══
 * Ni solde, ni mot de passe, ni valeur des e-cards consommées, ni leurs codes. Une inscription
 * réussie n'a aucune raison de renvoyer de la valeur au porteur — la réponse d'un endpoint
 * PUBLIC encore moins qu'une autre.
 */
export class RegisteredMemberDto {
  @ApiProperty() id!: number;

  @ApiProperty({
    example: 'NP001463',
    description:
      'Code membre attribué immédiatement (D-013). C’est un IDENTIFIANT DE CONNEXION : il ' +
      'n’est envoyé par aucun canal, l’écran doit donc le montrer et permettre de le copier.',
  })
  memberCode!: string;

  @ApiProperty() lastName!: string;
  @ApiProperty() firstName!: string;

  @ApiProperty({
    enum: MemberStatus,
    description:
      'REGISTERED à ce stade : la place dans l’arbre est définitive, mais aucun point n’a été ' +
      'injecté — seule l’activation en injecte (D-005).',
  })
  status!: MemberStatus;

  @ApiProperty({ description: 'Code du parrain — déclenche SA commission directe.' })
  sponsorCode!: string;

  @ApiProperty({
    description:
      'Code de l’upline de PLACEMENT — position dans l’arbre. Distinct du sponsor (D-003).',
  })
  uplineCode!: string;

  @ApiProperty({ enum: Leg }) leg!: Leg;

  @ApiProperty({
    enum: VerificationStatus,
    description: 'PENDING à l’inscription. NON BLOQUANT (D-018) : n’empêche rien.',
  })
  verificationStatus!: VerificationStatus;

  @ApiProperty() registeredAt!: Date;

  @ApiProperty({
    example: '100.000',
    description:
      'DINARS réellement versés, FIGÉS (D-036). C’est l’ACOMPTE déduit du prix du pack à ' +
      'l’activation (D-037) — jamais relu depuis le paramètre courant.',
  })
  registrationPaidDt!: string;
}
