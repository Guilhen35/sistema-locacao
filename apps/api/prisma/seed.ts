import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/auth/password.js';

const PERMISSIONS: ReadonlyArray<readonly [string, string]> = [
  ['clientes:ler', 'Ver clientes'],
  ['clientes:editar', 'Criar e editar clientes'],
  ['maquinas:ler', 'Ver máquinas'],
  ['maquinas:editar', 'Criar e editar máquinas, fotos e preços'],
  ['contratos:ler', 'Ver contratos'],
  ['contratos:editar', 'Criar e editar contratos'],
  ['financeiro:ler', 'Ver financeiro'],
  ['financeiro:editar', 'Lançar e editar no financeiro'],
  ['manutencao:ler', 'Ver manutenções'],
  ['manutencao:editar', 'Registrar manutenções'],
  ['relatorios:ler', 'Ver relatórios'],
  ['usuarios:gerenciar', 'Convidar, bloquear e definir perfis de usuários'],
  ['auditoria:ler', 'Ver o histórico de auditoria'],
];

// Só o admin controla quem entra no sistema e vê quem fez o quê
const ADMIN_ONLY = new Set(['usuarios:gerenciar', 'auditoria:ler']);

const ROLES = [
  { name: 'admin', description: 'Acesso total ao sistema', permissions: PERMISSIONS.map(([key]) => key) },
  {
    name: 'equipe',
    description: 'Operação do dia a dia, sem gestão de usuários e auditoria',
    permissions: PERMISSIONS.map(([key]) => key).filter((key) => !ADMIN_ONLY.has(key)),
  },
];

const databaseUrl = process.env['DATABASE_URL'];
const adminName = process.env['SEED_ADMIN_NAME']?.trim();
const adminEmail = process.env['SEED_ADMIN_EMAIL']?.trim().toLowerCase();

if (!databaseUrl || !adminName || !adminEmail) {
  throw new Error('Defina DATABASE_URL, SEED_ADMIN_NAME e SEED_ADMIN_EMAIL no .env');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main(name: string, email: string) {
  const permissionIds = new Map<string, string>();
  for (const [key, description] of PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
    permissionIds.set(key, permission.id);
  }

  const roleIds = new Map<string, string>();
  for (const role of ROLES) {
    const saved = await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: { name: role.name, description: role.description },
    });
    roleIds.set(role.name, saved.id);

    // Sincroniza: remove permissões que saíram da lista e adiciona as novas
    const wanted = role.permissions.map((key) => permissionIds.get(key)).filter((id): id is string => !!id);
    await prisma.rolePermission.deleteMany({ where: { roleId: saved.id, permissionId: { notIn: wanted } } });
    for (const permissionId of wanted) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: saved.id, permissionId } },
        update: {},
        create: { roleId: saved.id, permissionId },
      });
    }
    console.log(`Perfil ${role.name}: ${wanted.length} permissões`);
  }

  const adminRoleId = roleIds.get('admin');
  if (!adminRoleId) throw new Error('Perfil admin não foi criado');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} já existe. A senha NÃO foi alterada.`);
    return;
  }

  const tempPassword = randomBytes(12).toString('base64url');
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(tempPassword),
      roleId: adminRoleId,
      mustChangePassword: true,
    },
  });

  await prisma.auditLog.create({
    data: { action: 'seed.admin_criado', entity: 'user', entityId: user.id, after: { email, role: 'admin' } },
  });

  console.log(`\nAdmin criado: ${email}`);
  console.log(`Senha temporária (aparece só agora): ${tempPassword}`);
  console.log('Ela deve ser trocada no primeiro login.\n');
}

main(adminName, adminEmail)
  .catch((error: unknown) => {
    console.error('Falha no seed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());