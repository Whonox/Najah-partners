import { Injectable, NotFoundException } from '@nestjs/common';
import { Setting } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Paramètres système (spec §7.2.11). Table clé/valeur seedée : durée de validité des e-cards,
 * frais d'inscription, renouvellement annuel, planification du run de commissions, préfixe des
 * codes membres, devise d'affichage.
 *
 * DEUX limites volontaires :
 *  - **Ni création ni suppression de clé.** Une clé n'existe que parce qu'un service la lit ;
 *    en inventer une par l'API ne ferait rien, en supprimer une casserait son consommateur.
 *    Le seed est la source des clés.
 *  - **Aucune interprétation de la valeur.** Valider ici que `commission_cron_day` est un jour
 *    ou que `registration_fee_dt` est un montant reviendrait à écrire une règle métier dans un
 *    CRUD ; ce sont les consommateurs qui savent lire leur clé et qui refusent une valeur
 *    invalide (voir `MembershipFeeService`, qui lève sur une valeur illisible).
 *
 * Un changement de paramètre ne réécrit JAMAIS l'historique : tout ce qui compte est figé au
 * snapshot de la transaction (invariant CLAUDE.md). Modifier une valeur ici n'affecte que les
 * transactions POSTÉRIEURES.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<Setting[]> {
    return this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
  }

  /**
   * Met à jour une valeur et trace le changement (avant / après) dans le même mouvement :
   * un paramètre modifié sans trace serait un changement de règle du jeu sans auteur.
   */
  async update(params: {
    adminId: number;
    key: string;
    value: string;
  }): Promise<Setting> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.setting.findUnique({ where: { key: params.key } });
      if (!before) {
        throw new NotFoundException(`Paramètre inconnu : ${params.key}`);
      }
      const after = await tx.setting.update({
        where: { key: params.key },
        data: { value: params.value },
      });
      await tx.auditLog.create({
        data: {
          actor: String(params.adminId),
          action: 'SETTING_UPDATE',
          target: `Setting:${params.key}`,
          before: { value: before.value },
          after: { value: after.value },
        },
      });
      return after;
    });
  }
}
