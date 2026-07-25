import { ForbiddenException, Injectable } from '@nestjs/common';
import { RegisterMemberDto } from './dto/register-member.dto';
import { IdentityDocumentService } from './identity-document.service';
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
   * ═══ L'IMAGE DE LA PIÈCE N'EST PLUS EXIGÉE ICI (D-050, D-060) ═══
   * Le TYPE et le NUMÉRO restent saisis au formulaire (D-039) ; l'IMAGE se dépose à la
   * première connexion, dans le parcours d'accueil bloquant. Trois raisons :
   *  - cet endpoint est PUBLIC et ANONYME (D-021) : il n'a pas à recevoir un binaire de 5 Mo
   *    d'un inconnu, ni à en écrire un sur disque avant toute authentification ;
   *  - c'était l'étape la plus coûteuse d'un formulaire rempli au téléphone, donc celle où
   *    l'inscription s'abandonnait ;
   *  - déposé sous identité connue, le fichier devient traçable et le dépôt réessayable.
   *
   * L'invariant de la Tranche 4 (« jamais de membre sans son document ») est délibérément
   * remplacé par « jamais de membre DANS LE PORTAIL sans son document » : le parcours
   * d'accueil est bloquant (D-057), le membre ne peut donc pas différer indéfiniment — il ne
   * peut simplement plus le faire avant d'exister.
   *
   * Le fichier reste accepté s'il est fourni (compatibilité d'appelants, tests, seed) : il est
   * alors écrit AVANT la transaction, et supprimé si l'inscription échoue — position prise,
   * contact déjà utilisé, paiement refusé, course perdue.
   */
  async register(
    dto: RegisterMemberDto,
    file?: Express.Multer.File,
  ): Promise<RegisteredMember> {
    if (!file) {
      return this.members.register({
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
          number: dto.idDocumentNumber.trim(),
        },
      });
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
      const inMySubtree = await this.placement.isSponsorOnPathOf(
        memberId,
        root,
      );
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
