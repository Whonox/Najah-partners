import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Leg, MemberStatus } from '@prisma/client';

/**
 * Un nœud de la généalogie (spec §7.2.3). Miroir de doc de `TreeNode` — sans lui, la route
 * sort sans schéma et le client TS des fronts retombe en `unknown`.
 *
 * Liste blanche stricte, imposée par la CTE elle-même : ni solde, ni hash de mot de passe,
 * ni chemin de pièce d'identité ne descendent dans l'arbre. Un nœud ne porte que ce qu'on
 * affiche sur une case : qui, dans quel état, avec quel pack, et ses POINTS par jambe
 * (entiers — un nœud d'arbre ne porte JAMAIS de dinars, D-028).
 */
export class TreeNodeDto {
  @ApiProperty({ description: 'Profondeur relative à la racine demandée (0 = elle-même).' })
  depth!: number;

  @ApiProperty() id!: number;
  @ApiProperty({ example: 'NP000042' }) memberCode!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ enum: MemberStatus }) status!: MemberStatus;

  @ApiPropertyOptional({
    enum: Leg,
    nullable: true,
    description: 'Jambe occupée sous l’upline. null pour la racine de l’arbre global.',
  })
  leg!: Leg | null;

  @ApiPropertyOptional({ nullable: true }) uplineId!: number | null;
  @ApiPropertyOptional({ nullable: true }) packName!: string | null;
  @ApiPropertyOptional({ nullable: true }) activatedAt!: Date | null;

  @ApiProperty({ example: 3000, description: 'POINTS — cumul à vie de la jambe gauche.' })
  leftPoints!: number;
  @ApiProperty({ example: 2000, description: 'POINTS — cumul à vie de la jambe droite.' })
  rightPoints!: number;

  @ApiProperty({
    description:
      'Un downline gauche existe, MÊME au-delà de la profondeur ramenée : c’est ce qui distingue une feuille réelle d’une feuille tronquée par la borne.',
  })
  hasLeftChild!: boolean;
  @ApiProperty({ description: 'Idem à droite.' })
  hasRightChild!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: () => TreeNodeDto,
    description: 'Sous-arbre gauche RAMENÉ. null si absent ou au-delà de `depth`.',
  })
  left!: TreeNodeDto | null;

  @ApiPropertyOptional({
    nullable: true,
    type: () => TreeNodeDto,
    description: 'Sous-arbre droit RAMENÉ. null si absent ou au-delà de `depth`.',
  })
  right!: TreeNodeDto | null;
}
