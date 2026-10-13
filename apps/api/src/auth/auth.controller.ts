import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { loginSchema, type LoginInput } from '@locacao/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';

// __Host- obriga o navegador a só aceitar o cookie com Secure, Path=/ e sem Domain
export const SESSION_COOKIE = '__Host-sid';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, expiresAt, user } = await this.auth.login(body, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      expires: expiresAt,
    });

    // O token vai só no cookie, nunca no corpo da resposta
    return { user };
  }
}