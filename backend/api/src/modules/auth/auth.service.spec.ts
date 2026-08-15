import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ClientType, UserRole } from '@prisma/client';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const users = {
    findByEmail: jest.fn(),
    findClientByPhone: jest.fn(),
    create: jest.fn(),
    assertEmailAvailable: jest.fn(),
    assertClientPhoneAvailable: jest.fn(),
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
          role: UserRole.ADMIN,
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('regista apenas um cliente e inicia a sessão', async () => {
    users.assertClientPhoneAvailable.mockResolvedValue('+244923456789');
    users.create.mockResolvedValue({
      id: 'client-1',
      email: 'cliente.internal@cliente.local',
      name: 'Cliente Teste',
      role: UserRole.CLIENT,
      mfaEnabled: false,
      phone: '+244923456789',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prisma.userSession.create.mockResolvedValue({ id: 'session-1' });
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

    const result = await service.registerClient(
      {
        name: '  Cliente Teste  ',
        phone: '923456789',
        isCompany: false,
        password: 'palavra-passe-segura',
      },
      '127.0.0.1',
      'jest',
    );

    expect(users.assertClientPhoneAvailable).toHaveBeenCalledWith('923456789');
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Cliente Teste',
        role: UserRole.CLIENT,
        phone: '+244923456789',
        clientType: ClientType.INDIVIDUAL,
        nif: null,
      }),
    );
    expect(result).toMatchObject({
      user: { id: 'client-1', role: UserRole.CLIENT },
      accessToken: 'access-token',
    });
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

  it('procura cliente pelo telefone', async () => {
    users.findClientByPhone.mockResolvedValue(null);

    await expect(
      service.login({
        phone: '244923456789',
        password: '12345678',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.findClientByPhone).toHaveBeenCalledWith('244923456789');
    expect(users.findByEmail).not.toHaveBeenCalled();
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
