import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, AdminRole } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import type { AuthenticatedActor } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { RequireActor } from './decorators/actor-type.decorator';
import { Roles } from './decorators/roles.decorator';
import { AdminLoginDto } from './dto/admin-login.dto';
import {
  AccessTokenResponseDto,
  AdminLoginResponseDto,
  AdminProfileResponseDto,
  AuthenticatedActorDto,
  MemberLoginResponseDto,
  SuccessResponseDto,
} from './dto/auth-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { MemberLoginDto } from './dto/member-login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordResetService } from './password-reset.service';
import { RefreshContext, TokenService } from './token.service';

const REFRESH_COOKIE = 'refresh_token';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokens: TokenService,
    private readonly passwordReset: PasswordResetService,
    private readonly config: ConfigService,
  ) {}

  // ─────────────────────── Login ───────────────────────

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('member/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion affilié (email / téléphone / code membre)' })
  @ApiOkResponse({ type: MemberLoginResponseDto })
  async memberLogin(
    @Body() dto: MemberLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MemberLoginResponseDto> {
    const { member, ...actor } = await this.authService.validateMember(
      dto.identifier,
      dto.password,
    );
    const accessToken = await this.issueSession(actor, req, res);
    // Projection explicite : la réponse ne porte que l'identité, jamais l'état financier
    // du compte (voir MemberSummaryDto). Le portail lit le reste sous token.
    return {
      accessToken,
      member: {
        id: member.id,
        memberCode: member.memberCode,
        firstName: member.firstName,
        lastName: member.lastName,
        status: member.status,
      },
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion administrateur' })
  @ApiOkResponse({ type: AdminLoginResponseDto })
  async adminLogin(
    @Body() dto: AdminLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const actor = await this.authService.validateAdmin(dto.email, dto.password);
    const accessToken = await this.issueSession(actor, req, res);
    return { accessToken, actor };
  }

  // ─────────────────────── Refresh / Logout ───────────────────────

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Émet un nouvel access token à partir du cookie refresh' })
  @ApiOkResponse({ type: AccessTokenResponseDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = this.readRefreshCookie(req);
    if (!presented) {
      throw new UnauthorizedException('Refresh token absent');
    }
    const { accessToken, refresh } = await this.tokens.rotateRefreshToken(
      presented,
      this.refreshContext(req),
    );
    this.setRefreshCookie(res, refresh.token);
    return { accessToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Déconnexion : révoque le refresh et efface le cookie' })
  @ApiOkResponse({ type: SuccessResponseDto })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = this.readRefreshCookie(req);
    if (presented) {
      await this.tokens.revokeRefreshToken(presented);
    }
    this.clearRefreshCookie(res);
    return { success: true };
  }

  // ─────────────────────── Récupération de mot de passe (membres) ───────────────────────

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('member/password/forgot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demande de réinitialisation (réponse toujours neutre)' })
  @ApiOkResponse({ type: SuccessResponseDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.passwordReset.requestReset(dto.identifier);
    return { success: true };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('member/password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Applique un nouveau mot de passe via token usage unique' })
  @ApiOkResponse({ type: SuccessResponseDto })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.passwordReset.resetPassword(dto.token, dto.newPassword);
    return { success: true };
  }

  // ─────────────────────── Routes protégées (démo cloisonnement) ───────────────────────

  @Get('me')
  @ApiOperation({ summary: "Acteur authentifié (n'importe quel type)" })
  @ApiOkResponse({ type: AuthenticatedActorDto })
  me(@CurrentUser() user: AuthenticatedActor) {
    return user;
  }

  @RequireActor(ActorType.ADMIN)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @Get('admin/me')
  @ApiOperation({
    summary: 'Profil de l’admin connecté (nom, e-mail, rôle) — en-tête du back-office',
  })
  @ApiOkResponse({ type: AdminProfileResponseDto })
  adminMe(@CurrentUser() user: AuthenticatedActor) {
    return this.authService.getAdminProfile(user.id);
  }

  @RequireActor(ActorType.ADMIN)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @Get('admin/ping')
  @ApiOperation({ summary: 'Route réservée ADMIN (rejette un token MEMBER)' })
  adminPing(@CurrentUser() user: AuthenticatedActor) {
    return { pong: true, actorType: user.actorType, role: user.role };
  }

  @RequireActor(ActorType.MEMBER)
  @Get('member/ping')
  @ApiOperation({ summary: 'Route réservée MEMBER (rejette un token ADMIN)' })
  memberPing(@CurrentUser() user: AuthenticatedActor) {
    return { pong: true, actorType: user.actorType };
  }

  // ─────────────────────── Helpers cookie / session ───────────────────────

  private async issueSession(
    actor: AuthenticatedActor,
    req: Request,
    res: Response,
  ): Promise<string> {
    const refresh = await this.tokens.issueRefreshToken(
      actor,
      this.refreshContext(req),
    );
    this.setRefreshCookie(res, refresh.token);
    return this.tokens.signAccessToken(actor);
  }

  private refreshContext(req: Request): RefreshContext {
    return {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    };
  }

  private readRefreshCookie(req: Request): string | undefined {
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    return cookies?.[REFRESH_COOKIE];
  }

  private cookieOptions() {
    const sameSite = this.config.get<string>('COOKIE_SAMESITE', 'lax') as
      | 'lax'
      | 'strict'
      | 'none';
    return {
      httpOnly: true,
      secure: this.config.get<string>('COOKIE_SECURE', 'false') === 'true',
      sameSite,
      path: '/auth',
    };
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, this.cookieOptions());
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }
}
