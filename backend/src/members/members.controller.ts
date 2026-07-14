import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ActorType } from '@prisma/client';
import { memoryStorage } from 'multer';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RegisterMemberDto } from './dto/register-member.dto';
import { TreeQueryDto } from './dto/tree-query.dto';
import { MAX_ID_DOCUMENT_BYTES } from './identity-document.service';
import { MembersFacade } from './members.facade';

/**
 * Surface publique et affilié. L'inscription est ouverte (D-021) : elle est donc
 * strictement limitée en débit — chaque inscription consomme une position DÉFINITIVE
 * dans l'arbre (D-013 : ni expiration, ni libération) et un code membre.
 */
@ApiTags('members')
@Controller('members')
export class MembersController {
  constructor(private readonly facade: MembersFacade) {}

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } }) // 5 inscriptions / heure / IP
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: RegisterMemberDto })
  @ApiOperation({
    summary:
      'Inscription : crée un membre INSCRIT, code attribué, place définitive, aucun BV.',
  })
  @UseInterceptors(
    FileInterceptor('idDocument', {
      storage: memoryStorage(), // le fichier n'atteint le disque qu'une fois validé
      limits: { fileSize: MAX_ID_DOCUMENT_BYTES, files: 1 },
    }),
  )
  register(
    @Body() dto: RegisterMemberDto,
    @UploadedFile() idDocument?: Express.Multer.File,
  ) {
    return this.facade.register(dto, idDocument);
  }

  @Get('me/tree')
  @RequireActor(ActorType.MEMBER)
  @ApiOperation({ summary: 'Sous-arbre binaire du membre connecté (spec §7.1.5).' })
  tree(@CurrentUser() actor: AuthenticatedActor, @Query() query: TreeQueryDto) {
    return this.facade.tree(actor.id, query.depth);
  }
}
