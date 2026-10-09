# Sistema de Locação

Sistema de gestão para locadora de plataformas elevatórias: clientes, frota, contratos, agenda, financeiro e dashboards.

## Stack

- **Frontend:** React + Vite + TypeScript (`apps/web`)
- **Backend:** NestJS + TypeScript (`apps/api`)
- **Banco:** PostgreSQL 17 + Prisma
- **Código compartilhado:** `packages/shared`

## Como rodar (GitHub Codespaces)

1. Abra o repositório em um Codespace. O ambiente (Node 24, pnpm e PostgreSQL) sobe automaticamente.
2. Copie as variáveis de ambiente:

```bash
   cp .env.example .env
```

3. Instale as dependências:

```bash
   pnpm install
```

## Segurança

- Nunca versionar `.env` ou qualquer segredo.
- Dados de produção nunca são usados em desenvolvimento.
