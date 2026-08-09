import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import {
  EMAIL_ALREADY_REGISTERED_MESSAGE,
  isValidEmailShape,
  normalizeEmail,
} from '../../common/email.util';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    const normalized = normalizeEmail(email);
    if (!normalized) {
      return null;
    }
    return this.prisma.user.findFirst({
      where: {
        email: { equals: normalized, mode: 'insensitive' },
      },
    });
  }

  /** Garante email único em todas as contas (cliente, admin, equipa). */
  async assertEmailAvailable(
    email: string,
    excludeUserId?: string,
  ): Promise<string> {
    const normalized = normalizeEmail(email);
    if (!normalized || !isValidEmailShape(normalized)) {
      throw new BadRequestException('Email inválido.');
    }
    const existing = await this.findByEmail(normalized);
    if (existing && existing.id !== excludeUserId) {
      throw new ConflictException(EMAIL_ALREADY_REGISTERED_MESSAGE);
    }
    return normalized;
  }

  /** Consulta disponibilidade de email (sem lançar excepção). */
  async checkEmailAvailability(email: string, excludeUserId?: string) {
    const normalized = normalizeEmail(email);
    if (!normalized) {
      return { available: false, message: 'Indique o email.' };
    }
    if (!isValidEmailShape(normalized)) {
      return { available: false, message: 'Email inválido.' };
    }
    const existing = await this.findByEmail(normalized);
    if (existing && existing.id !== excludeUserId) {
      return {
        available: false,
        message: EMAIL_ALREADY_REGISTERED_MESSAGE,
        existingRole: existing.role,
      };
    }
    return { available: true, email: normalized };
  }

  private isPrismaUniqueViolation(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
    );
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        mfaEnabled: true,
        phone: true,
        createdAt: true,
      },
    });
  }

  /** Lista para painel admin (sem dados sensíveis). */
  async findManyForAdmin(opts?: {
    search?: string;
    role?: UserRole;
    excludeRole?: UserRole;
    includeOrderCount?: boolean;
  }) {
    const q = opts?.search?.trim();
    const where: Prisma.UserWhereInput = {};
    if (opts?.role) {
      where.role = opts.role;
    } else if (opts?.excludeRole) {
      where.role = { not: opts.excludeRole };
    }
    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const whereClause = Object.keys(where).length ? where : undefined;

    if (opts?.includeOrderCount) {
      const rows = await this.prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          mfaEnabled: true,
          phone: true,
          createdAt: true,
          _count: { select: { ordersAsClient: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(({ _count, ...user }) => ({
        ...user,
        orderCount: _count.ordersAsClient,
      }));
    }

    return this.prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        mfaEnabled: true,
        phone: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Busca rápida de clientes para PDV (balcão). */
  async findClientsForCounterSearch(qRaw: string, take = 20) {
    const q = qRaw.trim();
    if (q.length < 2) {
      return [];
    }
    return this.prisma.user.findMany({
      where: {
        role: UserRole.CLIENT,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        createdAt: true,
      },
      take: Math.min(Math.max(take, 1), 50),
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Cliente criado no balcão com palavra-passe aleatória (pode ser redefinida depois pelo admin).
   */
  async createBalcaoClient(opts: {
    name: string;
    phone?: string | null;
    email?: string | null;
  }) {
    const name = opts.name.trim();
    if (name.length < 2) {
      throw new BadRequestException('Nome do cliente inválido.');
    }
    const email = (
      opts.email?.trim() ||
      `balcao.${randomUUID().replace(/-/g, '').slice(0, 16)}@cliente.local`
    ).toLowerCase();

    if (!email.endsWith('@cliente.local')) {
      await this.assertEmailAvailable(email);
    } else {
      const exists = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (exists) {
        throw new ConflictException(EMAIL_ALREADY_REGISTERED_MESSAGE);
      }
    }
    const plain = randomBytes(18).toString('base64url');
    const passwordHash = await bcrypt.hash(plain, 10);
    try {
      return await this.prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          role: UserRole.CLIENT,
          phone: opts.phone?.trim() ? opts.phone.trim() : null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          createdAt: true,
        },
      });
    } catch (err) {
      if (this.isPrismaUniqueViolation(err)) {
        throw new ConflictException(EMAIL_ALREADY_REGISTERED_MESSAGE);
      }
      throw err;
    }
  }

  async create(data: {
    email: string;
    name: string;
    passwordHash: string;
    role: UserRole;
    phone?: string | null;
  }) {
    const email = normalizeEmail(data.email);
    try {
      return await this.prisma.user.create({
        data: {
          email,
          name: data.name,
          passwordHash: data.passwordHash,
          role: data.role,
          phone: data.phone?.trim() ? data.phone.trim() : undefined,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          mfaEnabled: true,
          phone: true,
          createdAt: true,
        },
      });
    } catch (err) {
      if (this.isPrismaUniqueViolation(err)) {
        throw new ConflictException(EMAIL_ALREADY_REGISTERED_MESSAGE);
      }
      throw err;
    }
  }

  /**
   * Garante que o utilizador pode ser eliminado (sem violar FKs nem regras de admin).
   */
  async assertDeletableOrThrow(id: string, actorId: string): Promise<void> {
    if (id === actorId) {
      throw new BadRequestException('Não pode eliminar a própria conta.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!user) {
      throw new NotFoundException('Utilizador não encontrado.');
    }
    if (user.role === UserRole.ADMIN) {
      const admins = await this.prisma.user.count({
        where: { role: UserRole.ADMIN },
      });
      if (admins <= 1) {
        throw new ConflictException(
          'Não pode eliminar o último administrador.',
        );
      }
    }
    const [
      ordersAsClient,
      ordersAsDesigner,
      ordersAsAttendant,
      artCreated,
      artApproved,
      annotations,
      checklistChecked,
    ] = await Promise.all([
      this.prisma.order.count({ where: { clientId: id } }),
      this.prisma.order.count({ where: { designerId: id } }),
      this.prisma.order.count({ where: { attendantId: id } }),
      this.prisma.artVersion.count({ where: { createdById: id } }),
      this.prisma.artVersion.count({ where: { approvedById: id } }),
      this.prisma.annotation.count({ where: { authorId: id } }),
      this.prisma.technicalChecklistItem.count({
        where: { checkedById: id },
      }),
    ]);
    const parts: string[] = [];
    if (ordersAsClient > 0) {
      parts.push(`${ordersAsClient} pedido(s) como cliente`);
    }
    if (ordersAsDesigner > 0) {
      parts.push(`${ordersAsDesigner} pedido(s) como designer`);
    }
    if (ordersAsAttendant > 0) {
      parts.push(`${ordersAsAttendant} pedido(s) registados no balcão`);
    }
    if (artCreated > 0) {
      parts.push(`${artCreated} versão(ões) de arte criadas`);
    }
    if (artApproved > 0) {
      parts.push(`${artApproved} versão(ões) de arte aprovadas`);
    }
    if (annotations > 0) {
      parts.push(`${annotations} anotação(ões)`);
    }
    if (checklistChecked > 0) {
      parts.push(`${checklistChecked} item(ns) de checklist`);
    }
    if (parts.length > 0) {
      throw new ConflictException(
        `Não é possível eliminar: ${parts.join('; ')}.`,
      );
    }
  }

  async deleteHard(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }
}
