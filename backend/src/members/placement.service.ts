import { Injectable } from '@nestjs/common';
import { MemberStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MemberNotFoundError, TreeTruncatedError } from './members.errors';
import { TreeRow } from './members.types';

/**
 * Garde-fou de profondeur des CTE récursives : une corruption de données (cycle) ne doit
 * pas produire une boucle infinie côté serveur. Un arbre binaire réel n'atteint jamais
 * cette profondeur (2^1000 nœuds) ; l'atteindre signifie que quelque chose est cassé.
 */
const MAX_CHAIN_DEPTH = 1000;

/** Profondeur de descente par défaut et maximale d'une consultation d'arbre. */
export const DEFAULT_TREE_DEPTH = 3;
export const MAX_TREE_DEPTH = 8;

interface ChainRow {
  id: number;
  uplineId: number | null;
  depth: number;
}

/**
 * Requête de VERROU ORDONNÉ, extraite pour qu'un test puisse l'`EXPLAIN` telle quelle et
 * prouver la présence du verrou (nœud `LockRows`) — sans re-taper le SQL, ce qui rendrait
 * le test tautologique et incapable d'attraper la suppression de la clause de verrouillage.
 */
export function buildLockChainQuery(memberId: number): Prisma.Sql {
  return Prisma.sql`
    WITH RECURSIVE chain AS (
        SELECT m."id", m."uplineId", 0 AS depth
        FROM "Member" m
        WHERE m."id" = ${memberId}
      UNION ALL
        SELECT p."id", p."uplineId", c.depth + 1
        FROM chain c
        JOIN "Member" p ON p."id" = c."uplineId"
        WHERE c.depth < ${MAX_CHAIN_DEPTH}
    )
    SELECT m."id", m."uplineId", c.depth
    FROM "Member" m
    JOIN chain c ON c."id" = m."id"
    ORDER BY m."id"
    FOR NO KEY UPDATE OF m
  `;
}

export interface LockedChain {
  /** Membre + ancêtres, verrouillés, triés par id croissant. */
  ids: number[];
  /** Nombre d'ancêtres (membre exclu) : c'est le nombre de lignes que la propagation doit toucher. */
  ancestorCount: number;
}

/** Forme brute du RETURNING (le driver rend l'enum en texte, le JSONB en objet). */
interface PropagatedAncestorRow {
  id: number;
  distance: number;
  status: string;
  activationTierBv: number | null;
  activationSnapshot: unknown;
  carriedLeftPoints: number;
  carriedRightPoints: number;
  lifetimeBalanceCount: number;
  startupBonusUsed: boolean;
  activatedDescendants: number;
}

/**
 * Un ancêtre tel que la propagation d'activation l'a laissé — l'entrée du temps 1 du moteur
 * de commissions (D-035). Toutes les valeurs sont relues par le `RETURNING`, donc SOUS le
 * verrou de chaîne : détection d'équilibre et consommation de points sont sérialisées.
 */
export interface PropagatedAncestor {
  id: number;
  /** 0 = upline direct du membre activé, croissant vers la racine. */
  distance: number;
  status: MemberStatus;
  /** Palier (POINTS) figé à l'activation de CET ancêtre — null s'il n'a jamais activé. */
  activationTierBv: number | null;
  /** Snapshot d'activation de CET ancêtre (Json) — montants en DT figés (D-028). */
  activationSnapshot: unknown;
  /** Pools appariables APRÈS crédit de cette activation. */
  carriedLeftPoints: number;
  carriedRightPoints: number;
  /** Compteur d'équilibres à vie AVANT les événements de cette activation (D-032). */
  lifetimeBalanceCount: number;
  startupBonusUsed: boolean;
  /** Membres activés dans le sous-arbre, CETTE activation comprise (D-031). */
  activatedDescendants: number;
}

/**
 * Toute la traversée de l'arbre binaire, en SQL ensembliste (D-014) : jamais de boucle
 * applicative, jamais de N+1. Trois opérations, et l'ordre de verrouillage qui les rend
 * sûres sous concurrence (D-024, voir .claude/rules/tree.md).
 */
@Injectable()
export class PlacementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * VERROU ORDONNÉ — doit être la PREMIÈRE instruction touchant `Member` de la transaction
   * d'activation. Verrouille le membre ET tous ses ancêtres jusqu'à la racine, par id
   * CROISSANT : toutes les transactions acquérant leurs verrous dans le même ordre total,
   * le graphe d'attente est acyclique → aucun interblocage possible. Verrouiller le membre
   * lui-même hors de cette séquence (il est l'ancêtre d'une autre transaction) suffirait à
   * réintroduire le deadlock.
   *
   * On joint la table de base `Member m` et on verrouille explicitement `OF m` : c'est cette
   * jointure sur la table de base — et non les lignes matérialisées de la CTE — qui garantit
   * un verrou RÉEL. Verrouiller la CTE (`FOR ... OF chain`) lèverait une erreur ; sélectionner
   * uniquement depuis la CTE ne verrouillerait rien. `OF m` documente aussi qu'on ne verrouille
   * que `Member`, jamais une relation ajoutée par erreur si la requête évolue (voir tree.md, D-024).
   */
  async lockChainInTx(
    tx: Prisma.TransactionClient,
    memberId: number,
  ): Promise<LockedChain> {
    const rows = await tx.$queryRaw<ChainRow[]>(buildLockChainQuery(memberId));

    if (rows.length === 0) {
      throw new MemberNotFoundError(memberId);
    }
    // La racine (et elle seule) n'a pas d'upline : si aucune ligne n'a `uplineId` nul, la
    // remontée s'est arrêtée sur le garde-fou → le chemin est tronqué, on ne committe rien.
    const reachedRoot = rows.some((row) => row.uplineId === null);
    if (!reachedRoot) {
      throw new TreeTruncatedError(
        memberId,
        `racine non atteinte en ${MAX_CHAIN_DEPTH} niveaux`,
      );
    }

    return {
      ids: rows.map((row) => row.id),
      ancestorCount: rows.length - 1,
    };
  }

  /**
   * PROPAGATION ASCENDANTE — injecte `tierBv` sur la bonne jambe de CHAQUE ancêtre jusqu'à
   * la racine (D-020), en UNE requête ensembliste.
   *
   * La règle exacte : pour chaque nœud N du chemin (le membre activé inclus), on crédite
   * `N.uplineId` sur **la jambe de N** — surtout pas sur la jambe du membre activé. Exemple :
   * un membre en jambe GAUCHE de son upline, lui-même en jambe DROITE de son propre upline,
   * crédite ce dernier à DROITE.
   *
   * Depuis la Tranche 7 (D-035), la même instruction entretient TROIS compteurs :
   *  - `leftPoints` / `rightPoints` — cumul À VIE, crédité quel que soit l'état (D-020) ;
   *  - `carriedLeftPoints` / `carriedRightPoints` — la POOL APPARIABLE, créditée SEULEMENT
   *    si l'ancêtre est ACTIF : un INSCRIT n'a pas encore de baseline (ses points d'avant
   *    activation ne compteront jamais pour lui), un GELÉ ne compte pas les points du gel
   *    (D-034) — dans les deux cas les points TRAVERSENT et continuent de monter ;
   *  - `activatedDescendants` — +1 partout : le sous-arbre de chaque ancêtre vient de
   *    gagner un membre activé (déclencheur du bonus D-031, « exactement 2 »).
   *
   * Le `RETURNING` sert de preuve : si le nombre d'ancêtres crédités diffère du chemin
   * verrouillé, la propagation est tronquée → on lève, la transaction est annulée (une
   * propagation partielle qui committerait serait une corruption comptable irréversible).
   * Il rapporte aussi tout ce que le moteur de commissions (temps 1, D-035) doit savoir
   * pour détecter les équilibres — pools APRÈS crédit, palier et snapshot d'activation,
   * compteurs à vie — sans relire les lignes déjà verrouillées.
   */
  async propagateInTx(
    tx: Prisma.TransactionClient,
    memberId: number,
    tierBv: number,
    expectedAncestors: number,
  ): Promise<PropagatedAncestor[]> {
    const rows = await tx.$queryRaw<PropagatedAncestorRow[]>`
      WITH RECURSIVE chain AS (
          SELECT m."id", m."uplineId", m."leg", 0 AS depth
          FROM "Member" m
          WHERE m."id" = ${memberId}
        UNION ALL
          SELECT p."id", p."uplineId", p."leg", c.depth + 1
          FROM chain c
          JOIN "Member" p ON p."id" = c."uplineId"
          WHERE c.depth < ${MAX_CHAIN_DEPTH}
      ),
      credits AS (
          SELECT c."uplineId" AS ancestor_id,
                 MIN(c.depth) AS distance,  -- 0 = upline direct du membre activé
                 SUM(CASE WHEN c."leg" = 'LEFT'::"Leg"  THEN ${tierBv}::int ELSE 0 END)::int AS add_left,
                 SUM(CASE WHEN c."leg" = 'RIGHT'::"Leg" THEN ${tierBv}::int ELSE 0 END)::int AS add_right
          FROM chain c
          WHERE c."uplineId" IS NOT NULL   -- exclut la racine (pas d'upline) ; le membre activé
          GROUP BY c."uplineId"            -- n'est jamais son propre ancêtre : ses jambes ne bougent pas
      )
      UPDATE "Member" m
      SET "leftPoints"  = m."leftPoints"  + cr.add_left,
          "rightPoints" = m."rightPoints" + cr.add_right,
          "carriedLeftPoints"  = m."carriedLeftPoints"
              + CASE WHEN m."status" = 'ACTIVE'::"MemberStatus" THEN cr.add_left  ELSE 0 END,
          "carriedRightPoints" = m."carriedRightPoints"
              + CASE WHEN m."status" = 'ACTIVE'::"MemberStatus" THEN cr.add_right ELSE 0 END,
          "activatedDescendants" = m."activatedDescendants" + 1
      FROM credits cr
      WHERE m."id" = cr.ancestor_id
      RETURNING m."id", cr.distance::int AS "distance", m."status",
                m."activationTierBv", m."activationSnapshot",
                m."carriedLeftPoints", m."carriedRightPoints",
                m."lifetimeBalanceCount", m."startupBonusUsed", m."activatedDescendants"
    `;

    if (rows.length !== expectedAncestors) {
      throw new TreeTruncatedError(
        memberId,
        `${rows.length} ancêtre(s) crédité(s) pour ${expectedAncestors} attendu(s)`,
      );
    }
    // L'ordre des lignes d'un UPDATE … RETURNING n'est pas garanti : on retrie du plus
    // proche au plus lointain (la chronologie D-033 des événements d'une même activation).
    return rows
      .map((row) => ({ ...row, status: row.status as MemberStatus }))
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * D-022 : l'upline de placement doit être le sponsor lui-même, ou l'un de ses downlines.
   * On REMONTE depuis l'upline candidat (chemin court) au lieu de descendre depuis le
   * sponsor (sous-arbre potentiellement énorme).
   */
  async isSponsorOnPathOf(
    sponsorId: number,
    candidateUplineId: number,
  ): Promise<boolean> {
    if (sponsorId === candidateUplineId) {
      return true;
    }
    const rows = await this.prisma.$queryRaw<Array<{ found: boolean }>>`
      WITH RECURSIVE ancestors AS (
          SELECT m."id", m."uplineId", 0 AS depth
          FROM "Member" m
          WHERE m."id" = ${candidateUplineId}
        UNION ALL
          SELECT p."id", p."uplineId", a.depth + 1
          FROM ancestors a
          JOIN "Member" p ON p."id" = a."uplineId"
          WHERE a.depth < ${MAX_CHAIN_DEPTH}
      )
      SELECT EXISTS (SELECT 1 FROM ancestors WHERE "id" = ${sponsorId}) AS "found"
    `;
    return rows[0]?.found ?? false;
  }

  /**
   * DESCENTE bornée (lecture pure, aucun verrou) : le sous-arbre d'un membre en UNE requête.
   * La CTE ne transporte que (id, depth, path) — les colonnes larges gonfleraient le
   * tuplestore de la récursion ; les données sont jointes à la fin, en liste blanche
   * (jamais de hash de mot de passe, de solde ni de chemin de pièce d'identité).
   * `path` (suite de L/R) donne un tri stable et déterministe.
   */
  async descendants(memberId: number, depth: number): Promise<TreeRow[]> {
    return this.prisma.$queryRaw<TreeRow[]>`
      WITH RECURSIVE down AS (
          SELECT m."id", 0 AS depth, ''::text AS path
          FROM "Member" m
          WHERE m."id" = ${memberId}
        UNION ALL
          SELECT ch."id", d.depth + 1,
                 d.path || CASE WHEN ch."leg" = 'LEFT'::"Leg" THEN 'L' ELSE 'R' END
          FROM down d
          JOIN "Member" ch ON ch."uplineId" = d."id"
          WHERE d.depth < ${depth}::int
      )
      SELECT d.depth,
             m."id", m."memberCode", m."firstName", m."lastName", m."status",
             m."leg", m."uplineId", p."name" AS "packName", m."activatedAt",
             m."leftPoints", m."rightPoints"
      FROM down d
      JOIN "Member" m ON m."id" = d."id"
      LEFT JOIN "Pack" p ON p."id" = m."packId"
      ORDER BY d.depth, d.path
    `;
  }
}
