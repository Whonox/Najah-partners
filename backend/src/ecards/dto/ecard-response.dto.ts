import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EcardOrigin, EcardStatus } from '@prisma/client';

/**
 * Vue AFFILIÉ d'une e-card (spec §7.1.3).
 *
 * ═══ CE DTO NE PORTE PAS DE CHAMP `code`, ET C'EST STRUCTUREL (D-048) ═══
 * Un code est de la VALEUR AU PORTEUR : le connaître suffit à la dépenser. Il n'est restitué
 * qu'UNE FOIS, par `CreatedEcardResponseDto`, à l'instant où le membre vient de créer la carte.
 * Une liste, elle, se recharge à volonté : y laisser le code l'aurait fait circuler à chaque
 * ouverture d'écran, dans la réponse HTTP, dans le cache du navigateur et dans les journaux du
 * reverse-proxy. Le masquer côté front n'aurait donc rien protégé du tout.
 *
 * Même geste qu'`EcardAdminRowDto` côté back-office (D-045) : l'oubli devient impossible à
 * COMPILER, pas seulement déconseillé.
 */
export class EcardResponseDto {
  @ApiProperty({ description: 'Identifiant technique — le seul désignateur affichable.' })
  id!: number;

  @ApiProperty({
    example: '250.000',
    description: 'DINARS — une e-card est de l’argent (D-028). Jamais des points.',
  })
  valueDt!: string;

  @ApiProperty({
    enum: EcardStatus,
    description:
      'ACTIVE · USED (définitif) · EXPIRED (échéance) · REVOKED (admin). EXPIRED et REVOKED recréditent le créateur.',
  })
  status!: EcardStatus;

  @ApiProperty({
    enum: EcardOrigin,
    description:
      'MEMBER : la valeur a été débitée du solde du créateur. GENESIS : née ex nihilo côté admin — personne n’est remboursé à son expiration.',
  })
  origin!: EcardOrigin;

  @ApiProperty() createdAt!: Date;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Consommation (passage à USED) — `null` tant que la carte n’a rien payé.',
  })
  usedAt!: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    description: '`null` = illimité (paramètre `ecard_expiration_days` à -1).',
  })
  expiresAt!: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Passage à EXPIRED ou REVOKED — l’instant où la valeur est revenue au créateur.',
  })
  closedAt!: Date | null;
}

/**
 * La SEULE réponse de toute la surface affilié qui porte un code en clair : celle rendue à qui
 * vient de créer la carte.
 *
 * Pourquoi une fois, et pourquoi ici : il n'existe aucun canal de transmission (pas d'e-mail,
 * D-011). Sans cette réponse, le membre fabriquerait une carte que personne ne pourrait jamais
 * dépenser. Passé cet instant, le code n'est consultable NULLE PART — c'est au porteur de le
 * conserver, exactement comme un billet.
 */
export class CreatedEcardResponseDto extends EcardResponseDto {
  @ApiProperty({
    example: 'HHD-7Z7-JJD-77D',
    description:
      'Le code EN CLAIR, rendu une seule fois. Ne jamais le journaliser ni le stocker côté client.',
  })
  code!: string;
}

/**
 * Réponse de la vérification d'un code (spec §7.1.3) : validité + valeur, SANS consommer.
 *
 * Ne révèle ni le créateur ni le bénéficiaire — le porteur d'un code n'a pas à savoir qui l'a
 * émise, ni qui d'autre y a touché. Le résultat est INDICATIF : seule la consommation fait
 * autorité, et elle revérifie tout sous verrou.
 */
export class EcardVerificationResponseDto {
  @ApiProperty({ description: 'Utilisable ici et maintenant : ACTIVE et non échue.' })
  valid!: boolean;

  @ApiProperty({ example: '250.000', description: 'DINARS.' })
  valueDt!: string;

  @ApiProperty({ enum: EcardStatus })
  status!: EcardStatus;

  @ApiPropertyOptional({ nullable: true })
  expiresAt!: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'EXPIRED',
    description:
      'Renseigné si `valid` est faux : pourquoi la carte n’est pas utilisable (EXPIRED, ou le statut en cause).',
  })
  reason!: string | null;
}
