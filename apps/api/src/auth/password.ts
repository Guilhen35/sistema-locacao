import { hash, verify } from '@node-rs/argon2';

// Argon2id com os parâmetros mínimos recomendados pela OWASP
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Hash corrompido ou em formato inválido: trata como senha errada
    return false;
  }
}
