import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Só aceita nomes gerados pela própria API: bloqueia Path Traversal (ex.: "../../.env")
const KEY_FORMAT = /^[a-f0-9-]{36}\.webp$/;

function checkKey(key: string): string {
  if (!KEY_FORMAT.test(key)) throw new Error('Chave de arquivo inválida');
  return key;
}

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404;
}

// STORAGE_DRIVER=s3 em produção (Supabase Storage, R2...); disco local em desenvolvimento
@Injectable()
export class StorageService {
  private readonly root: string;
  private readonly s3?: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('UPLOAD_DIR') ?? './storage');
    this.bucket = config.get<string>('S3_BUCKET') ?? '';

    if (config.get<string>('STORAGE_DRIVER') === 's3') {
      this.s3 = new S3Client({
        endpoint: config.getOrThrow<string>('S3_ENDPOINT'),
        region: config.getOrThrow<string>('S3_REGION'),
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
          secretAccessKey: config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
        },
      });
      if (!this.bucket) throw new Error('Defina S3_BUCKET');
    }
  }

  async put(key: string, data: Buffer): Promise<void> {
    checkKey(key);
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: 'image/webp', CacheControl: 'private, max-age=86400' }),
      );
      return;
    }
    await mkdir(this.root, { recursive: true });
    // "wx": nunca sobrescreve um arquivo que já existe
    await writeFile(join(this.root, key), data, { flag: 'wx' });
  }

  async open(key: string): Promise<Readable> {
    checkKey(key);
    if (this.s3) {
      try {
        const result = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
        if (!result.Body) throw new NotFoundException('Arquivo não encontrado');
        return result.Body as Readable;
      } catch (error) {
        if (isNotFound(error)) throw new NotFoundException('Arquivo não encontrado');
        throw error;
      }
    }
    const path = join(this.root, key);
    try {
      await stat(path);
    } catch {
      throw new NotFoundException('Arquivo não encontrado');
    }
    return createReadStream(path);
  }

  async remove(key: string): Promise<void> {
    checkKey(key);
    if (this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return;
    }
    await rm(join(this.root, key), { force: true });
  }
}