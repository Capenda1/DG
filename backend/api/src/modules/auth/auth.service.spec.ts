import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const users = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    assertEmailAvailable: jest.fn(),
  };
  const jwt = {
    sign: jest.fn(),
  };
  const config = {
    get: jest.fn(),
  };
  const prisma = {
    user: {
      count: jest.fn(),
    },
    userSession: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };
  const mail = {
    isConfigured: jest.fn().mockResolvedValue(false),
    sendPasswordResetCodeEmail: jest.fn(),
  };
  const service = new AuthService(
    users as never,
    jwt as never,
    config as never,
    prisma as never,
    mail as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string) => {
      if (key === 'jwt.refreshExpiresDays') {
        return 7;
      }
      if (key === 'bootstrapAdminSecret') {
        return '';
      }
      return undefined;
    });
    jwt.sign.mockReturnValue('access-token');
  });

  it('createUserByAdmin falha quando email já existe', async () => {
    users.assertEmailAvailable.mockRejectedValue(
      new ConflictException('Este Email já está registado.'),
    );

    await expect(
      service.createUserByAdmin(
        {
          email: 'exists@example.com',
          name: 'User',
          password: '12345678',
          role: UserRole.CLIENT,
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('falha no login quando utilizador não existe', async () => {
    users.findByEmail.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'missing@example.com',
        password: '12345678',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('falha no refresh com sessão inválida', async () => {
    prisma.userSession.findFirst.mockResolvedValue(null);

    await expect(
      service.refresh({ refreshToken: 'invalid' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('bootstrapAdmin falha quando já existem utilizadores', async () => {
    prisma.user.count.mockResolvedValue(1);

    await expect(
      service.bootstrapAdmin(
        {
          email: 'a@example.com',
          name: 'A',
          password: '12345678',
        },
        undefined,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
