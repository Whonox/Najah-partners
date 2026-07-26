import { ConfigService } from '@nestjs/config';
import { Leg } from '@prisma/client';
import { EcardsService } from '../ecards/ecards.service';
import { PrismaService } from '../prisma/prisma.service';
import { MemberCodeService } from './member-code.service';
import { MembershipFeeService } from './membership-fee.service';
import { PlacementCheckRefusedError } from './members.errors';
import { MembersService } from './members.service';
import { PlacementService } from './placement.service';

/**
 * VÉRIFICATION PRÉALABLE DU PARRAINAGE (D-052, précisée par D-061).
 *
 * Ce que ces tests tiennent :
 *  — les QUATRE causes de refus rendent une réponse STRICTEMENT identique. C'est la seule
 *    propriété qui compte : cette route est publique et anonyme, et distinguer « ce code
 *    n'existe pas » de « cette place est prise » en ferait un annuaire interrogeable. Le test
 *    compare les réponses entre elles plutôt qu'à un libellé figé — ainsi il continue de
 *    protéger l'invariant même si l'on reformule le message ;
 *  — la réponse ne contient AUCUN des codes saisis : les recopier dans un message, fût-ce pour
 *    être aimable, confirmerait qu'ils ont été lus et cherchés ;
 *  — les contrôles sont ceux de l'inscription, dans le même ordre. Une pré-vérification plus
 *    laxiste laisserait passer ce que l'inscription refusera ; plus stricte, elle refuserait
 *    ce qu'elle accepterait. Les deux trahiraient l'affilié au pire moment.
 */

const SPONSOR = { id: 1 };
const UPLINE = { id: 2 };

function makeService(options: {
  sponsorFound?: boolean;
  uplineFound?: boolean;
  insideNetwork?: boolean;
  positionTaken?: boolean;
}) {
  const {
    sponsorFound = true,
    uplineFound = true,
    insideNetwork = true,
    positionTaken = false,
  } = options;

  const prisma = {
    member: {
      findUnique: jest.fn((args: { where: Record<string, unknown> }) => {
        // Recherche par position (upline, jambe) : le troisième appel du service.
        if ('uplineId_leg' in args.where) {
          return Promise.resolve(positionTaken ? { id: 99 } : null);
        }
        const code = String(args.where.memberCode);
        if (code.endsWith('963')) {
          return Promise.resolve(sponsorFound ? SPONSOR : null);
        }
        return Promise.resolve(uplineFound ? UPLINE : null);
      }),
    },
  } as unknown as PrismaService;

  const placement = {
    isSponsorOnPathOf: jest.fn(() => Promise.resolve(insideNetwork)),
  } as unknown as PlacementService;

  return new MembersService(
    prisma,
    { get: () => undefined } as unknown as ConfigService,
    placement,
    new MemberCodeService(),
    {} as unknown as MembershipFeeService,
    {} as unknown as EcardsService,
  );
}

const INPUT = {
  sponsorCode: 'NP000963',
  uplineCode: 'NP000999',
  leg: Leg.LEFT,
};

async function refusal(
  options: Parameters<typeof makeService>[0],
): Promise<PlacementCheckRefusedError> {
  try {
    await makeService(options).checkPlacement(INPUT);
    throw new Error('la vérification aurait dû être refusée');
  } catch (error) {
    return error as PlacementCheckRefusedError;
  }
}

describe('checkPlacement — le cas qui passe', () => {
  it('accepte un triplet valide', async () => {
    await expect(makeService({}).checkPlacement(INPUT)).resolves.toEqual({
      ok: true,
    });
  });
});

describe('checkPlacement — les quatre refus sont INDISTINGUABLES', () => {
  it('refuse un sponsor inconnu', async () => {
    await expect(
      makeService({ sponsorFound: false }).checkPlacement(INPUT),
    ).rejects.toBeInstanceOf(PlacementCheckRefusedError);
  });

  it('refuse un upline inconnu', async () => {
    await expect(
      makeService({ uplineFound: false }).checkPlacement(INPUT),
    ).rejects.toBeInstanceOf(PlacementCheckRefusedError);
  });

  it('refuse un upline hors du réseau du sponsor (D-022)', async () => {
    await expect(
      makeService({ insideNetwork: false }).checkPlacement(INPUT),
    ).rejects.toBeInstanceOf(PlacementCheckRefusedError);
  });

  it('refuse une position déjà occupée (D-004 : aucun spillover)', async () => {
    await expect(
      makeService({ positionTaken: true }).checkPlacement(INPUT),
    ).rejects.toBeInstanceOf(PlacementCheckRefusedError);
  });

  it('rend EXACTEMENT la même réponse dans les quatre cas', async () => {
    const responses = await Promise.all([
      refusal({ sponsorFound: false }),
      refusal({ uplineFound: false }),
      refusal({ insideNetwork: false }),
      refusal({ positionTaken: true }),
    ]);

    const [first, ...rest] = responses;
    for (const other of rest) {
      expect(other.getStatus()).toBe(first.getStatus());
      expect(other.getResponse()).toEqual(first.getResponse());
    }
  });

  it('ne recopie AUCUN des codes saisis dans sa réponse', async () => {
    // Les renvoyer, même par politesse, confirmerait qu'ils ont été lus et cherchés.
    const body = JSON.stringify(
      (await refusal({ sponsorFound: false })).getResponse(),
    );
    expect(body).not.toContain('NP000963');
    expect(body).not.toContain('NP000999');
    expect(body).not.toContain('LEFT');
  });

  it('porte un code exploitable par l’écran, sans nommer la cause', async () => {
    // Le portail doit pouvoir ramener l'affilié à l'étape 3 ; le code dit QUELLE étape,
    // jamais QUOI corriger précisément.
    expect(
      (await refusal({ positionTaken: true })).getResponse(),
    ).toMatchObject({
      code: 'PLACEMENT_REFUSED',
    });
  });
});

describe('checkPlacement — ordre des contrôles', () => {
  it('n’interroge pas la position quand le sponsor est déjà inconnu', async () => {
    // Court-circuit : sans lui, un sponsor inconnu déclencherait quand même une lecture de
    // position, et le temps de réponse distinguerait les causes que le message tait.
    const service = makeService({ sponsorFound: false });
    const prisma = (
      service as unknown as { prisma: { member: { findUnique: jest.Mock } } }
    ).prisma;

    await refusal({ sponsorFound: false });
    await service.checkPlacement(INPUT).catch(() => undefined);

    const positionLookups = prisma.member.findUnique.mock.calls.filter(
      (call) => 'uplineId_leg' in (call[0] as { where: object }).where,
    );
    expect(positionLookups).toHaveLength(0);
  });
});
