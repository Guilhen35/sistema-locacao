import { createHash, randomBytes } from 'node:crypto';

// 32 bytes = 256 bits de aleatoriedade: impossível de adivinhar
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

// O banco guarda só o hash: se vazar, os tokens não servem para entrar
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}