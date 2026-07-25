import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';

/**
 * Comptes administrateurs et rôles (spec §7.2.12).
 *
 * ═══ LES PERMISSIONS NE SONT PAS EXPOSÉES, ET CE N'EST PAS UN OUBLI ═══
 * La spec §7.2.12 mentionne « permissions par module », ce qui suggérerait une matrice
 * modifiable depuis l'interface. Or les rôles sont un ENUM figé (`AdminRole`) et les permissions
 * sont écrites dans les guards du backend (`@Roles`) : elles ne sont pas des données. Rendre la
 * matrice éditable serait une refonte du modèle d'autorisation — donc une décision métier, non
 * tranchée avec la cliente (voir docs/decisions.md). Aucune matrice n'est donc implémentée, et
 * la colonne `AdminUser.permissions` reste inutilisée plutôt que d'être à moitié branchée.
 *
 * Le `passwordHash` ne sort JAMAIS d'ici — comme pour les membres, c'est une liste blanche de
 * champs, jamais la ligne Prisma.
 */
export class AdminUserDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({
    enum: AdminRole,
    description: 'Rôle FIXE (enum). Les droits associés sont codés dans les guards du backend.',
  })
  role!: AdminRole;
  @ApiProperty({
    description:
      'Un compte désactivé ne peut plus se connecter, et ses sessions en cours sont révoquées.',
  })
  active!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Dernière ouverture de session connue, déduite des jetons de rafraîchissement (voir le journal des sessions). `null` = ce compte ne s’est jamais connecté.',
  })
  lastLoginAt!: Date | null;
  @ApiProperty({ description: 'Sessions actuellement valides (jetons non révoqués, non expirés).' })
  activeSessionCount!: number;
}

/**
 * Une SESSION, telle qu'on peut la reconstituer — le « journal de connexion » de §7.2.12.
 *
 * ═══ CE N'EST PAS UN JOURNAL DE CONNEXION COMPLET, ET IL FAUT LE SAVOIR ═══
 * Aucune table n'enregistre les tentatives de connexion. Ce que la base contient réellement, ce
 * sont les jetons de rafraîchissement (D-016) : chaque ouverture de session en crée une famille,
 * avec son IP, son navigateur, sa date, et sa révocation éventuelle. C'est donc un journal des
 * SESSIONS RÉUSSIES, reconstruit à partir de données réellement écrites — et non un journal de
 * connexion inventé.
 *
 * Ce qui manque, en toute transparence : les ÉCHECS de connexion (mot de passe faux, compte
 * désactivé) ne laissent aucune trace en base. Les enregistrer demanderait une nouvelle table et
 * une écriture dans le chemin d'authentification — consigné comme point ouvert.
 */
export class AdminSessionDto {
  @ApiProperty({ description: 'Identifiant de la famille de jetons = une session.' })
  familyId!: string;
  @ApiProperty({ description: 'Ouverture de la session (première émission de la famille).' })
  startedAt!: Date;
  @ApiProperty({ description: 'Dernière rotation du jeton — l’activité la plus récente.' })
  lastSeenAt!: Date;
  @ApiPropertyOptional({ nullable: true, description: 'Adresse IP vue par le serveur.' })
  ip!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Navigateur déclaré (User-Agent).' })
  userAgent!: string | null;
  @ApiProperty({
    description:
      'Session encore utilisable : au moins un jeton non révoqué et non expiré. Faux = déconnexion, rotation terminée, ou expiration.',
  })
  current!: boolean;
  @ApiProperty() expiresAt!: Date;
}

export class AdminSessionsDto {
  @ApiProperty() adminUserId!: number;
  @ApiProperty({ type: [AdminSessionDto], description: 'Plus récentes d’abord.' })
  sessions!: AdminSessionDto[];
  @ApiProperty({
    description:
      'Les tentatives de connexion ÉCHOUÉES ne sont enregistrées nulle part : ce journal ne les contient pas (point ouvert).',
  })
  failedAttemptsRecorded!: boolean;
}
