const { PrismaClient, UserRole } = require('@prisma/client');
const bcrypt = require('bcrypt');

async function main() {
  const prisma = new PrismaClient();
  const email = 'admin@dadiva.com';
  const password = 'Admin12345';

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: 'Admin Dádiva',
      passwordHash,
      role: UserRole.ADMIN,
    },
    update: {
      name: 'Admin Dádiva',
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  // eslint-disable-next-line no-console
  console.log('ADMIN pronto:', { id: user.id, email: user.email, role: user.role });
  await prisma.$disconnect();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

