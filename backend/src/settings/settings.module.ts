import { Module } from '@nestjs/common';
import { SettingsAdminController } from './settings-admin.controller';
import { SettingsService } from './settings.service';

/**
 * Paramètres système (spec §7.2.11). PrismaModule est @Global et les guards d'auth sont
 * globaux (Tranche 2) : ce module n'a rien à importer.
 */
@Module({
  controllers: [SettingsAdminController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
