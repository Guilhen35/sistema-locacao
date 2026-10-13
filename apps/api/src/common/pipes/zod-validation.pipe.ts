import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { z, type ZodType } from 'zod';

export class ZodValidationPipe<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      // Devolve só as mensagens por campo, nunca o valor enviado
      throw new BadRequestException({
        message: 'Dados inválidos',
        errors: z.flattenError(result.error).fieldErrors,
      });
    }

    return result.data;
  }
}