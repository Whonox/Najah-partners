import { ForbiddenException, Injectable } from '@nestjs/common';
import { RegisterMemberDto } from './dto/register-member.dto';
import { IdentityDocumentService } from './identity-document.service';
import { InvalidIdDocumentError } from './members.errors';
import { MembersService } from './members.service';
import { RegisteredMember, TreeNode } from './members.types';
import { DEFAULT_TREE_DEPTH, PlacementService } from './placement.service';
import { buildTree } from './tree.builder';

/**
 * Orchestration des cas d'usage HTTP : ce qui relie le fichier de pièce d'identité (hors
 * base) à l'inscription (en base), et les lignes plates de la CTE à l'arbre imbriqué.
 * Les services de domaine restent utilisables seuls (seed, tests, tranches suivantes).
 */
@Injectable()
export class MembersFacade {
  constructor(
    private readonly members: MembersService,
    private readonly placement: PlacementService,
    private readonly documents: IdentityDocumentService,
  ) {}

  /**
   * Le fichier est écrit AVANT la transaction (l'inscription a besoin de son chemin) ; si
   * l'inscription échoue — position prise, contact déjà utilisé, paiement refusé, course
   * perdue —, le fichier est supprimé. Il n'existe donc jamais de membre sans son document,
   * ni de document sans son membre.
   */
  async register(
    dto: RegisterMemberDto,
    file?: Express.Multer.File,
  ): Promise<RegisteredMember> {
    if (!file) {
      throw new InvalidIdDocumentError(
        'une image de la pièce d’identité est requise à l’inscription (D-018).',
      );
    }

    const stored = await this.documents.store(file);
    try {
      return await this.members.register({
        lastName: dto.lastName,
        firstName: dto.firstName,
        email: dto.email,
        phone: dto.phone,
        password: dto.password,
        sponsorCode: dto.sponsorCode,
        uplineCode: dto.uplineCode,
        leg: dto.leg,
        ecardCodes: dto.ecardCodes,
        idDocument: {
          type: dto.idDocumentType,
          relativePath: stored.relativePath,
          number: dto.idDocumentNumber.trim(),
        },
      });
    } catch (error) {
      await this.documents.discard(stored.relativePath);
      throw error;
    }
  }

  /**
   * Sous-arbre imbriqué : une seule requête récursive, assemblage en mémoire.
   *
   * `rootMemberId` RECENTRE l'affichage sur un downline (T9, spec §7.1.5) — c'est ce qui
   * permet de descendre de proche en proche sans jamais charger l'arbre entier : chaque
   * descente est une nouvelle requête BORNÉE, et non un dépliage qui s'accumule.
   *
   * Il est vérifié qu'il appartient bien au sous-arbre de l'appelant. Sans ce contrôle, la
   * route deviendrait « l'arbre de n'importe qui » : il suffirait de changer un nombre dans
   * l'URL pour lire le réseau d'un inconnu. `isSponsorOnPathOf(a, b)` répond exactement à la
   * question posée — « a est-il sur le chemin de PLACEMENT de b, ou b lui-même ? » —, en
   * REMONTANT depuis le candidat (chemin court) plutôt qu'en descendant depuis la racine
   * (sous-arbre potentiellement énorme).
   */
  async tree(
    memberId: number,
    depth?: number,
    rootMemberId?: number,
  ): Promise<TreeNode | null> {
    const root = rootMemberId ?? memberId;

    if (root !== memberId) {
      const inMySubtree = await this.placement.isSponsorOnPathOf(memberId, root);
      if (!inMySubtree) {
        throw new ForbiddenException(
          'Ce membre n’appartient pas à votre réseau.',
        );
      }
    }

    const rows = await this.placement.descendants(
      root,
      depth ?? DEFAULT_TREE_DEPTH,
    );
    return buildTree(rows);
  }
}
