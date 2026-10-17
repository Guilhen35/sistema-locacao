import { z } from 'zod';

// Mensagens padrão do Zod em português
z.config(z.locales.pt());

export * from './auth.js';
export * from './client.js';
export * from './document.js';
export * from './machine.js';
export * from './contract.js';
export * from './maintenance.js';
export * from './finance.js';
export * from './user.js';
