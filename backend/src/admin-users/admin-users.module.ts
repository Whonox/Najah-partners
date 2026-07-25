import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

/**
 * Comptes administrateurs et rôles (§7.2.12).
 *
 * Aucune dépendance vers `AuthModule` : ce module hache un mot de passe (bcrypt, mêmes tours que
 * l'authentification via `BCRYPT_ROUNDS`) et révoque des jetons par un `updateMany` — il n'a
 * besoin ni d'émettre un jeton, ni de vérifier un mot de passe. Importer `AuthModule` pour deux
 * lignes créerait un couplage entre « distribuer les droits » et « ouvrir une session ».
 */
@Module({
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
})
export class AdminUsersModule {}
