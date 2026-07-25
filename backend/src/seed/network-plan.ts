import { Leg, MemberStatus } from '@prisma/client';

/**
 * Plan du réseau d'amorçage (révise D-019 : 7 comptes → 500).
 *
 * Ce module est PUR : il ne touche ni la base, ni les services. Il décrit QUI se place OÙ,
 * sous quel sponsor, avec quel pack et quel statut final — et rien d'autre. Le seed exécute
 * ensuite ce plan par les VRAIS services (inscription puis activation), seule façon d'obtenir
 * un arbre cohérent avec le code qu'il est censé amorcer.
 *
 * Trois invariants portés par la construction elle-même, pas par des contrôles a posteriori :
 *  1. UNE SEULE RACINE. Le nœud 0 est le seul sans upline ; tout autre nœud naît dans un
 *     emplacement libre d'un nœud DÉJÀ créé. Un membre orphelin est donc impossible.
 *  2. ORDRE TOP-DOWN. `uplineIndex < index` toujours : l'inscription (qui exige un upline
 *     existant) peut dérouler le plan dans l'ordre du tableau, sans tri préalable.
 *  3. D-022 RESPECTÉ. Le sponsor est TOUJOURS pris sur le chemin racine→upline (l'upline
 *     inclus), donc l'upline appartient forcément au sous-arbre du sponsor.
 *
 * DÉTERMINISME : aucun `Math.random`. Un générateur à graine fixe rend le réseau reproductible
 * à l'identique — un seed qui change de forme à chaque exécution rendrait tout diagnostic
 * (« pourquoi ce membre a-t-il 3 équilibres ? ») impossible à rejouer.
 */

/** Taille du réseau d'amorçage. */
export const SEED_NETWORK_SIZE = 500;

/** Graine du générateur : la changer change TOUT le réseau. Ne pas la toucher sans raison. */
export const SEED_RANDOM_SEED = 20260725;

/**
 * Biais de profondeur du tirage de position. Plus il est grand, plus l'arbre est large et plat
 * (les emplacements proches de la racine sont préférés). À 1, l'arbre part en filaments ; au-delà
 * de 3, il devient un arbre parfait sans intérêt. 1,6 donne un réseau MLM plausible : un tronc
 * dense sur les premiers niveaux, des jambes longues et inégales en dessous — donc du carry-over.
 */
const DEPTH_BIAS = 1.6;

/** Probabilité que le sponsor soit l'upline de placement lui-même (cas le plus courant). */
const SPONSOR_IS_UPLINE_RATE = 0.6;

/** Répartition des statuts finaux (D-034). Le reste des membres est ACTIF. */
const REGISTERED_COUNT = 100; // inscrits jamais activés
const INACTIVE_COUNT = 50; // activés puis gelés faute de renouvellement

/**
 * Répartition des packs sur les membres ACTIVÉS (actifs + gelés). Les INSCRITS n'ont pas de
 * pack : ils n'ont jamais activé, et un pack sans activation n'existe pas dans ce modèle.
 */
const PACK_MIX: Array<{ name: string; share: number }> = [
  { name: 'Silver', share: 0.55 },
  { name: 'Gold', share: 0.25 },
  { name: 'Safari', share: 0.13 },
  { name: 'Diamond', share: 0.07 },
];

const FIRST_NAMES = [
  'Mohamed', 'Ahmed', 'Ali', 'Youssef', 'Karim', 'Nizar', 'Sami', 'Bilel',
  'Hatem', 'Slim', 'Wassim', 'Anis', 'Mehdi', 'Rami', 'Tarek', 'Zied',
  'Amine', 'Farouk', 'Hedi', 'Skander', 'Aymen', 'Ghazi', 'Marouane', 'Oussama',
  'Salma', 'Ines', 'Mariem', 'Rania', 'Amira', 'Nour', 'Yasmine', 'Sarra',
  'Emna', 'Hiba', 'Dorra', 'Leila', 'Sonia', 'Fatma', 'Olfa', 'Nadia',
  'Imen', 'Rim', 'Asma', 'Khouloud', 'Sabrine', 'Wafa', 'Hela', 'Meriem',
];

const LAST_NAMES = [
  'Ben Salah', 'Trabelsi', 'Gharbi', 'Jebali', 'Mansouri', 'Bouazizi', 'Chaabane',
  'Hammami', 'Khelifi', 'Sassi', 'Ayari', 'Zouari', 'Baccouche', 'Mejri',
  'Nasri', 'Ferchichi', 'Belhadj', 'Dridi', 'Ouali', 'Rekik', 'Slimani',
  'Bouzid', 'Marzouki', 'Chebbi', 'Guesmi', 'Karray', 'Laabidi', 'Msakni',
  'Riahi', 'Tounsi', 'Yahyaoui', 'Zaidi', 'Amri', 'Bahri', 'Cherif', 'Daoud',
];

/** Un nœud du plan. Les liens sont des INDEX dans le tableau, jamais des identifiants base. */
export interface PlannedMember {
  /** Position dans le plan ET ordre d'inscription. 0 = racine. */
  index: number;
  /** Sous qui se place le membre. `null` pour la seule racine. */
  uplineIndex: number | null;
  /** Jambe occupée chez l'upline. `null` pour la seule racine. */
  leg: Leg | null;
  /** Qui a parrainé (commission directe). Toujours sur le chemin racine→upline (D-022). */
  sponsorIndex: number | null;
  /** Profondeur depuis la racine (0 pour la racine). */
  depth: number;
  /** Statut visé une fois le plan exécuté. */
  status: MemberStatus;
  /** Pack d'activation, `null` pour un INSCRIT (jamais activé). */
  packName: string | null;
  firstName: string;
  lastName: string;
  /** Adresse unique — l'index la rend unique quels que soient les homonymes. */
  email: string;
}

export interface NetworkPlanOptions {
  size?: number;
  seed?: number;
}

/**
 * Générateur pseudo-aléatoire mulberry32 : 32 bits d'état, une seule graine, même suite à
 * chaque exécution sur n'importe quelle machine. `Math.random` ne convient pas — il n'est ni
 * reproductible ni ensemençable.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Emplacement libre : une jambe encore vide chez un membre déjà placé. */
interface FreeSlot {
  ownerIndex: number;
  leg: Leg;
}

/**
 * Mélange de Fisher-Yates piloté par le générateur ensemencé : sert à répartir statuts et packs
 * sans corrélation avec la position dans l'arbre (sinon tous les gelés seraient au même endroit,
 * et le moteur de commissions ne serait jamais exercé sur un gel en milieu de jambe).
 */
function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Construit la liste de packs à distribuer, complétée en Silver pour tomber juste. */
function packPool(activatedCount: number): string[] {
  const pool: string[] = [];
  for (const { name, share } of PACK_MIX.slice(1)) {
    pool.push(...new Array<string>(Math.round(activatedCount * share)).fill(name));
  }
  // Le pack majoritaire absorbe l'arrondi : la somme fait EXACTEMENT le nombre d'activés —
  // un pack de trop et un membre activé se retrouverait sans pack (crash à l'exécution).
  const remaining = Math.max(0, activatedCount - pool.length);
  pool.unshift(...new Array<string>(remaining).fill(PACK_MIX[0].name));
  return pool.slice(0, activatedCount);
}

/**
 * Construit le plan complet. Le tirage d'un emplacement est pondéré par la profondeur de son
 * propriétaire : `1 / (1 + profondeur)^DEPTH_BIAS`. Un tirage uniforme produirait un arbre
 * quasi parfait (tous les emplacements se valent) ; la pondération recrée ce qu'on observe
 * dans un vrai réseau — le haut se remplit vite, le bas s'étire en jambes inégales.
 */
export function buildNetworkPlan(
  options: NetworkPlanOptions = {},
): PlannedMember[] {
  const size = options.size ?? SEED_NETWORK_SIZE;
  const random = mulberry32(options.seed ?? SEED_RANDOM_SEED);

  if (size < 1) {
    throw new Error('Le plan du réseau exige au moins la racine.');
  }

  const depths: number[] = [0];
  const uplines: Array<number | null> = [null];
  const legs: Array<Leg | null> = [null];
  const sponsors: Array<number | null> = [null];
  const slots: FreeSlot[] = [
    { ownerIndex: 0, leg: Leg.LEFT },
    { ownerIndex: 0, leg: Leg.RIGHT },
  ];

  for (let index = 1; index < size; index += 1) {
    const chosen = pickSlot(slots, depths, random);
    const slot = slots[chosen];
    slots.splice(chosen, 1);

    uplines[index] = slot.ownerIndex;
    legs[index] = slot.leg;
    depths[index] = depths[slot.ownerIndex] + 1;
    sponsors[index] = pickSponsor(slot.ownerIndex, uplines, random);

    slots.push(
      { ownerIndex: index, leg: Leg.LEFT },
      { ownerIndex: index, leg: Leg.RIGHT },
    );
  }

  const statuses = assignStatuses(size, random);
  const activatedIndexes = statuses
    .map((status, index) => ({ status, index }))
    .filter(({ status }) => status !== MemberStatus.REGISTERED)
    .map(({ index }) => index);
  const packs = shuffle(packPool(activatedIndexes.length), random);
  const packByIndex = new Map<number, string>();
  activatedIndexes.forEach((index, rank) => packByIndex.set(index, packs[rank]));

  return Array.from({ length: size }, (_, index) => {
    const firstName =
      index === 0 ? 'Racine' : FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)];
    const lastName =
      index === 0 ? 'Najah' : LAST_NAMES[Math.floor(random() * LAST_NAMES.length)];
    return {
      index,
      uplineIndex: uplines[index],
      leg: legs[index],
      sponsorIndex: sponsors[index],
      depth: depths[index],
      status: statuses[index],
      packName: packByIndex.get(index) ?? null,
      firstName,
      lastName,
      email: buildEmail(firstName, lastName, index),
    };
  });
}

/** Tirage pondéré d'un emplacement libre (biais vers le haut de l'arbre). */
function pickSlot(
  slots: FreeSlot[],
  depths: number[],
  random: () => number,
): number {
  let total = 0;
  const weights = slots.map((slot) => {
    const weight = 1 / Math.pow(1 + depths[slot.ownerIndex], DEPTH_BIAS);
    total += weight;
    return weight;
  });

  let ticket = random() * total;
  for (let i = 0; i < weights.length; i += 1) {
    ticket -= weights[i];
    if (ticket <= 0) {
      return i;
    }
  }
  return weights.length - 1; // filet de sécurité contre les arrondis flottants
}

/**
 * Sponsor = l'upline lui-même la plupart du temps, sinon un de ses ancêtres. Dans les deux cas
 * l'upline reste dans le sous-arbre du sponsor : D-022 est satisfait par CONSTRUCTION, jamais
 * par un rattrapage. Ce mélange reproduit le cas réel où un parrain place son filleul plus bas
 * dans sa propre jambe.
 */
function pickSponsor(
  uplineIndex: number,
  uplines: Array<number | null>,
  random: () => number,
): number {
  const chain: number[] = [uplineIndex];
  let current = uplines[uplineIndex];
  while (current !== null && current !== undefined) {
    chain.push(current);
    current = uplines[current];
  }
  if (chain.length === 1 || random() < SPONSOR_IS_UPLINE_RATE) {
    return uplineIndex;
  }
  return chain[1 + Math.floor(random() * (chain.length - 1))];
}

/**
 * Répartit les statuts. La racine est ACTIVE d'office : elle porte tout le réseau, un amorçage
 * dont la racine serait gelée n'aurait aucun sens. Le reste est tiré au sort — mais en nombres
 * EXACTS, pas en probabilités : un seed doit produire la même photo à chaque exécution.
 */
function assignStatuses(size: number, random: () => number): MemberStatus[] {
  const others = size - 1;
  const registered = Math.min(REGISTERED_COUNT, others);
  const inactive = Math.min(INACTIVE_COUNT, others - registered);
  const pool = [
    ...new Array<MemberStatus>(registered).fill(MemberStatus.REGISTERED),
    ...new Array<MemberStatus>(inactive).fill(MemberStatus.INACTIVE),
    ...new Array<MemberStatus>(others - registered - inactive).fill(
      MemberStatus.ACTIVE,
    ),
  ];
  return [MemberStatus.ACTIVE, ...shuffle(pool, random)];
}

/**
 * `prenom.nom.index@najah.local`. Tout ce qui n'est pas alphanumérique devient un tiret — pas
 * de translittération savante des accents : l'index suffit à garantir l'unicité, et une adresse
 * de seed n'a pas à être jolie, elle a à être valide et stable.
 */
function buildEmail(firstName: string, lastName: string, index: number): string {
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  return `${slug(firstName)}.${slug(lastName)}.${index}@najah.local`;
}

/** Statistiques du plan — sert au journal du seed et aux tests. */
export function summarizePlan(plan: PlannedMember[]): {
  total: number;
  active: number;
  registered: number;
  inactive: number;
  maxDepth: number;
  packs: Record<string, number>;
} {
  const count = (status: MemberStatus) =>
    plan.filter((node) => node.status === status).length;
  const packs: Record<string, number> = {};
  for (const node of plan) {
    if (node.packName) {
      packs[node.packName] = (packs[node.packName] ?? 0) + 1;
    }
  }
  return {
    total: plan.length,
    active: count(MemberStatus.ACTIVE),
    registered: count(MemberStatus.REGISTERED),
    inactive: count(MemberStatus.INACTIVE),
    maxDepth: plan.reduce((max, node) => Math.max(max, node.depth), 0),
    packs,
  };
}
