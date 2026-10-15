import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { changePasswordSchema, loginSchema, type ChangePasswordInput, type LoginInput } from '@locacao/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { CurrentSession } from './current-session.decorator.js';
import { type AuthenticatedSession, SESSION_COOKIE, SessionGuard } from './session.guard.js';

const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'strict', path: '/' } as const;

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, expiresAt, user } = await this.auth.login(body, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.cookie(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, expires: expiresAt });

    // O token vai só no cookie, nunca no corpo da resposta
    return { user };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  me(@CurrentSession() session: AuthenticatedSession) {
    return { user: session.user };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  async changePassword(
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    await this.auth.changePassword(session.user.id, session.sessionId, body, req.ip);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  async logout(
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(session.sessionId, session.user.id, req.ip);
    res.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
  }
}
