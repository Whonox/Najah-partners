import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminUsersService } from './admin-users.service';

/**
 * Ce que ces tests tiennent — tous des situations dont on ne SORT PLUS si elles arrivent :
 *  — un super-admin ne peut pas se désactiver ni se dégrader lui-même ;
 *  — le DERNIER super-admin actif est intouchable (sinon la plateforme devient inadministrable) ;
 *  — désactiver ou changer un rôle RÉVOQUE les sessions : sans cela, l'access token déjà émis
 *    garderait les anciens droits jusqu'à son expiration ;
 *  — aucun mot de passe, ni en clair ni haché, n'entre dans l'AuditLog.
 */

const SUPER_ADMIN = {
  id: 1,
  name: 'Root',
  email: 'root@najah-partners.tn',
  role: AdminRole.SUPER_ADMIN,
  active: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const MANAGER = { ...SUPER_ADMIN, id: 2, name: 'Sarra', role: AdminRole.MANAGER };

function mocks() {
  const tx = {
    adminUser: { create: jest.fn(), update: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    adminUser: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    refreshToken: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  return { tx, prisma };
}

describe('AdminUsersService', () => {
  let mock: ReturnType<typeof mocks>;
  let service: AdminUsersService;

  beforeEach(() => {
    mock = mocks();
    service = new AdminUsersService(
      mock.prisma as unknown as PrismaService,
      new ConfigService({ BCRYPT_ROUNDS: '4' }), // 4 tours : les tests n'ont pas à payer 10
    );
  });

  describe('garde-fous d’auto-verrouillage', () => {
    beforeEach(() => {
      mock.prisma.adminUser.findUnique.mockResolvedValue(SUPER_ADMIN);
    });

    it('refuse de SE désactiver soi-même', async () => {
      await expect(
        service.update(SUPER_ADMIN.id, { active: false }, SUPER_ADMIN.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuse de SE retirer le rôle SUPER_ADMIN', async () => {
      await expect(
        service.update(
          SUPER_ADMIN.id,
          { role: AdminRole.MANAGER },
          SUPER_ADMIN.id,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuse de désactiver le DERNIER super-admin actif, même par un autre compte', async () => {
      mock.prisma.adminUser.count.mockResolvedValue(0); // aucun autre SUPER_ADMIN actif
      await expect(
        service.update(SUPER_ADMIN.id, { active: false }, 99),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepte de désactiver un super-admin s’il en reste un autre', async () => {
      mock.prisma.adminUser.count.mockResolvedValue(1);
      mock.tx.adminUser.update.mockResolvedValue({
        ...SUPER_ADMIN,
        active: false,
      });

      await service.update(SUPER_ADMIN.id, { active: false }, 99);

      expect(mock.tx.adminUser.update).toHaveBeenCalled();
    });

    it('renommer n’est pas dégrader : aucun contrôle de dernier super-admin', async () => {
      mock.tx.adminUser.update.mockResolvedValue({ ...SUPER_ADMIN, name: 'Root 2' });

      await service.update(SUPER_ADMIN.id, { name: 'Root 2' }, SUPER_ADMIN.id);

      expect(mock.prisma.adminUser.count).not.toHaveBeenCalled();
      // Un simple renommage ne doit PAS déconnecter le compte.
      expect(mock.tx.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('révocation des sessions', () => {
    it('changer le RÔLE révoque les sessions (le jeton en cours porterait l’ancien rôle)', async () => {
      mock.prisma.adminUser.findUnique.mockResolvedValue(MANAGER);
      mock.tx.adminUser.update.mockResolvedValue({
        ...MANAGER,
        role: AdminRole.SUPPORT,
      });

      await service.update(MANAGER.id, { role: AdminRole.SUPPORT }, 1);

      expect(mock.tx.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { adminUserId: MANAGER.id, revokedAt: null } }),
      );
    });

    it('réinitialiser le mot de passe révoque les sessions et ne trace AUCUN mot de passe', async () => {
      mock.prisma.adminUser.findUnique.mockResolvedValue(MANAGER);

      await service.resetPassword(MANAGER.id, { password: 'un-mot-de-passe-long' }, 1);

      expect(mock.tx.refreshToken.updateMany).toHaveBeenCalled();
      const audit = mock.tx.auditLog.create.mock.calls[0][0].data;
      expect(JSON.stringify(audit)).not.toContain('un-mot-de-passe-long');
      expect(JSON.stringify(audit)).not.toContain('$2'); // ni le hash bcrypt
    });
  });

  describe('création', () => {
    it('refuse un e-mail déjà pris (comparaison insensible à la casse)', async () => {
      mock.prisma.adminUser.findUnique.mockResolvedValue({ id: 5 });
      await expect(
        service.create(
          {
            name: 'Doublon',
            email: 'ROOT@najah-partners.tn',
            role: AdminRole.SUPPORT,
            password: 'un-mot-de-passe-long',
          },
          1,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('normalise l’e-mail, hache le mot de passe et ne le trace pas', async () => {
      mock.prisma.adminUser.findUnique.mockResolvedValue(null);
      mock.tx.adminUser.create.mockResolvedValue(MANAGER);

      await service.create(
        {
          name: '  Sarra  ',
          email: '  Sarra@Najah-Partners.TN ',
          role: AdminRole.MANAGER,
          password: 'un-mot-de-passe-long',
        },
        1,
      );

      const created = mock.tx.adminUser.create.mock.calls[0][0].data;
      expect(created.email).toBe('sarra@najah-partners.tn');
      expect(created.name).toBe('Sarra');
      expect(created.passwordHash).not.toBe('un-mot-de-passe-long');
      const audit = mock.tx.auditLog.create.mock.calls[0][0].data;
      expect(JSON.stringify(audit)).not.toContain('un-mot-de-passe-long');
    });
  });

  describe('sessions', () => {
    it('regroupe les jetons par FAMILLE : une famille = une session, la dernière rotation fait foi', async () => {
      mock.prisma.adminUser.findUnique.mockResolvedValue({ id: 2 });
      const future = new Date(Date.now() + 86_400_000);
      mock.prisma.refreshToken.findMany.mockResolvedValue([
        {
          familyId: 'f1',
          createdAt: new Date('2026-07-20T08:00:00Z'),
          revokedAt: new Date('2026-07-20T09:00:00Z'), // rotation
          expiresAt: future,
          ip: '41.226.0.1',
          userAgent: 'Chrome',
        },
        {
          familyId: 'f1',
          createdAt: new Date('2026-07-20T09:00:00Z'),
          revokedAt: null,
          expiresAt: future,
          ip: null,
          userAgent: null,
        },
        {
          familyId: 'f2',
          createdAt: new Date('2026-07-24T08:00:00Z'),
          revokedAt: new Date('2026-07-24T10:00:00Z'),
          expiresAt: future,
          ip: '41.226.0.9',
          userAgent: 'Safari',
        },
      ]);

      const result = await service.sessions(2);

      expect(result.sessions).toHaveLength(2);
      // Plus récentes d'abord.
      expect(result.sessions[0].familyId).toBe('f2');
      const rotated = result.sessions[1];
      expect(rotated.startedAt.toISOString()).toBe('2026-07-20T08:00:00.000Z');
      expect(rotated.lastSeenAt.toISOString()).toBe('2026-07-20T09:00:00.000Z');
      expect(rotated.current).toBe(true); // le dernier jeton de la famille est vivant
      // L'IP de l'ouverture est conservée : la rotation n'en renvoie pas toujours une.
      expect(rotated.ip).toBe('41.226.0.1');
      // f2 : toute la famille est révoquée → session terminée.
      expect(result.sessions[0].current).toBe(false);
      // Et on le dit à l'écran : les échecs de connexion ne sont enregistrés nulle part.
      expect(result.failedAttemptsRecorded).toBe(false);
    });
  });
});
