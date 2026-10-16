import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentSession } from '../auth/current-session.decorator.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedSession } from '../auth/session.guard.js';
import { actorOf } from '../common/audit.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { MAX_PHOTO_BYTES, MachinePhotosService } from './machine-photos.service.js';

const reorderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(10) });
type ReorderBody = z.output<typeof reorderSchema>;

const ALLOWED_MIME = /^image\/(jpeg|png|webp)$/;

@Controller()
export class MachinePhotosController {
  constructor(private readonly photos: MachinePhotosService) {}

  @Post('machines/:id/photos')
  @RequirePermission('maquinas:editar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
      // Primeiro filtro (barato). A conferência de verdade é feita pelo sharp no serviço
      fileFilter: (_req, file, callback) => callback(null, ALLOWED_MIME.test(file.mimetype)),
    }),
  )
  upload(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('Envie uma foto JPG, PNG ou WebP de até 5 MB');
    return this.photos.upload(id, file.buffer, actorOf(session, req));
  }

  @Get('machine-photos/:photoId')
  @RequirePermission('maquinas:ler')
  async file(@Param('photoId', new ParseUUIDPipe()) photoId: string, @Res({ passthrough: true }) res: Response) {
    const stream = await this.photos.open(photoId);
    res.set('Cache-Control', 'private, max-age=86400');
    return new StreamableFile(stream, { type: 'image/webp', disposition: 'inline' });
  }

  @Put('machines/:id/photos/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('maquinas:editar')
  reorder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(reorderSchema)) body: ReorderBody,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    return this.photos.reorder(id, body.ids, actorOf(session, req));
  }

  @Delete('machines/:id/photos/:photoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('maquinas:editar')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    return this.photos.remove(id, photoId, actorOf(session, req));
  }
}