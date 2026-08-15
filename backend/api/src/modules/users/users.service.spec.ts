import { ConflictException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService email uniqueness', () => {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };
  const service = new UsersService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('assertEmailAvailable rejeita email duplicado', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'u-1',
      role: UserRole.ADMIN,
    });

    await expect(
      service.assertEmailAvailable('Admin@Test.com'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('assertEmailAvailable normaliza e aceita email livre', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.assertEmailAvailable('  New@User.com  ')).resolves.toBe(
      'new@user.com',
    );
  });

  it('encontra cliente com telefone guardado noutro formato', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u-1', role: UserRole.CLIENT, phone: '+244 923 456 789' },
    ]);

    await expect(
      service.findClientByPhone('923456789'),
    ).resolves.toMatchObject({ id: 'u-1' });
  });

  it('não escolhe uma conta quando o telefone está duplicado', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u-1', role: UserRole.CLIENT, phone: '923456789' },
      { id: 'u-2', role: UserRole.CLIENT, phone: '244923456789' },
    ]);

    await expect(service.findClientByPhone('+244 923 456 789')).resolves.toBeNull();
  });
});
