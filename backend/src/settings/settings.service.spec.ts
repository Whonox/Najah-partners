import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from './settings.service';

/**
 * Ce que ces tests tiennent : la liste est triée (l'écran admin ne réordonne rien), une clé
 * inconnue n'est jamais créée au passage, et toute modification laisse une trace avant/après
 * dans la MÊME transaction que l'écriture.
 */

function prismaMock() {
  const setting = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const auditLog = { create: jest.fn() };
  const tx = { setting, auditLog };
  return {
    setting,
    auditLog,
    $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
  };
}

describe('SettingsService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: SettingsService;

  beforeEach(() => {
    prisma = prismaMock();
    service = new SettingsService(prisma as unknown as PrismaService);
  });

  it('liste les paramètres triés par clé', async () => {
    prisma.setting.findMany.mockResolvedValue([]);

    await service.list();

    expect(prisma.setting.findMany).toHaveBeenCalledWith({
      orderBy: { key: 'asc' },
    });
  });

  it('met à jour la valeur et trace avant/après dans AuditLog', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      key: 'registration_fee_dt',
      value: '100',
      description: null,
    });
    prisma.setting.update.mockResolvedValue({
      key: 'registration_fee_dt',
      value: '120',
      description: null,
    });

    const updated = await service.update({
      adminId: 7,
      key: 'registration_fee_dt',
      value: '120',
    });

    expect(updated.value).toBe('120');
    expect(prisma.setting.update).toHaveBeenCalledWith({
      where: { key: 'registration_fee_dt' },
      data: { value: '120' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actor: '7',
        action: 'SETTING_UPDATE',
        target: 'Setting:registration_fee_dt',
        before: { value: '100' },
        after: { value: '120' },
      },
    });
  });

  it('refuse une clé inconnue — aucune clé n’est créée par une mise à jour', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);

    await expect(
      service.update({ adminId: 7, key: 'inconnue', value: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.setting.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
