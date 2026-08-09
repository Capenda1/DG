import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  OrderOrigin,
  PaymentMethod,
  ProductionProcess,
  UserRole,
} from '@prisma/client';
import { OrdersService } from './orders.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- mocks parciais do Prisma */
describe('OrdersService', () => {
  const prisma = {
    order: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    orderItem: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn(prisma),
    ),
  };
  const config = {
    get: jest.fn().mockReturnValue('uploads'),
  };
  const users = {
    findClientsForCounterSearch: jest.fn(),
    createBalcaoClient: jest.fn(),
  };
  const insumos = {
    descontarPorPedido: jest.fn().mockResolvedValue(undefined),
    addMovimento: jest.fn().mockResolvedValue(undefined),
  };
  const finance = {
    recordLedgerEntryForOrderPayment: jest.fn().mockResolvedValue(undefined),
    ensureBalcaoCashSessionIsOpen: jest.fn().mockResolvedValue(undefined),
  };
  const notifications = {
    notifyOrderFinished: jest.fn().mockResolvedValue(undefined),
  };
  const service = new OrdersService(
    prisma as never,
    config as never,
    users as never,
    insumos as never,
    finance as never,
    notifications as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filtra lista para CLIENT por clientId', async () => {
    prisma.order.findMany.mockResolvedValue([]);

    await service.findManyForList(
      { id: 'client-1', role: UserRole.CLIENT },
      50,
      0,
    );

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: 'client-1' },
        take: 50,
        skip: 0,
      }),
    );
  });

  it('filtra lista para DESIGNER — atribuídos + fila sem designer', async () => {
    prisma.order.findMany.mockResolvedValue([]);

    await service.findManyForList(
      { id: 'designer-1', role: UserRole.DESIGNER },
      50,
      0,
    );

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { designerId: 'designer-1' },
            {
              designerId: null,
              status: {
                in: [OrderStatus.SUBMITTED, OrderStatus.VALIDATION_PAYMENT],
              },
            },
            {
              designerId: null,
              status: OrderStatus.DRAFT,
              orderOrigin: 'BALCAO',
              draftSharedWithDesignTeam: true,
            },
            { status: OrderStatus.FINISHED },
          ],
        },
        take: 50,
        skip: 0,
      }),
    );
  });

  it('não filtra lista para ATTENDANT', async () => {
    prisma.order.findMany.mockResolvedValue([]);

    await service.findManyForList(
      { id: 'att-1', role: UserRole.ATTENDANT },
      50,
      0,
    );

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: undefined,
        take: 50,
        skip: 0,
      }),
    );
  });

  it('não filtra lista para ADMIN', async () => {
    prisma.order.findMany.mockResolvedValue([]);

    await service.findManyForList(
      { id: 'admin-1', role: UserRole.ADMIN },
      50,
      100,
    );

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: undefined,
        take: 50,
        skip: 100,
      }),
    );
  });

  it('rejeita transição inválida', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.DRAFT,
      clientId: 'client-1',
      designerId: null,
      paymentMethod: null,
      paymentProofKey: null,
    });

    await expect(
      service.changeStatus('order-1', OrderStatus.DELIVERED, {
        id: 'admin-1',
        role: UserRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloqueia avanço sem comprovativo quando o método exige anexo', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.SUBMITTED,
      clientId: 'client-1',
      designerId: null,
      paymentMethod: PaymentMethod.BANK_TRANSFER_SAME,
      paymentProofKey: null,
    });

    await expect(
      service.changeStatus('order-1', OrderStatus.VALIDATION_PAYMENT, {
        id: 'admin-1',
        role: UserRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('permite cancelar sem comprovativo mesmo com transferência', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.SUBMITTED,
      clientId: 'client-1',
      designerId: null,
      paymentMethod: PaymentMethod.BANK_TRANSFER_SAME,
      paymentProofKey: null,
    });
    prisma.order.update.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.CANCELLED,
    });
    prisma.auditLog.create.mockResolvedValue({});

    await service.changeStatus('order-1', OrderStatus.CANCELLED, {
      id: 'admin-1',
      role: UserRole.ADMIN,
    });

    expect(prisma.order.update).toHaveBeenCalled();
  });

  it('permite VALIDATION_PAYMENT quando há comprovativo', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.SUBMITTED,
      clientId: 'client-1',
      designerId: null,
      paymentMethod: PaymentMethod.BANK_TRANSFER_SAME,
      paymentProofKey: 'key-abc.pdf',
    });
    prisma.order.update.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.VALIDATION_PAYMENT,
    });
    prisma.auditLog.create.mockResolvedValue({});

    await service.changeStatus('order-1', OrderStatus.VALIDATION_PAYMENT, {
      id: 'admin-1',
      role: UserRole.ADMIN,
    });

    expect(prisma.order.update).toHaveBeenCalled();
  });

  it('atendente pode SUBMITTED → VALIDATION_PAYMENT com comprovativo', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.SUBMITTED,
      clientId: 'client-1',
      designerId: null,
      paymentMethod: PaymentMethod.BANK_TRANSFER_SAME,
      paymentProofKey: 'key-abc.pdf',
    });
    prisma.order.update.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.VALIDATION_PAYMENT,
    });
    prisma.auditLog.create.mockResolvedValue({});

    await service.changeStatus('order-1', OrderStatus.VALIDATION_PAYMENT, {
      id: 'att-1',
      role: UserRole.ATTENDANT,
    });

    expect(prisma.order.update).toHaveBeenCalled();
  });

  it('atendente pode FINISHED → DELIVERED', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.FINISHED,
      clientId: 'client-1',
      designerId: 'des-1',
      paymentMethod: PaymentMethod.PDV_CASH,
      paymentProofKey: null,
    });
    prisma.order.update.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.DELIVERED,
    });
    prisma.auditLog.create.mockResolvedValue({});

    await service.changeStatus('order-1', OrderStatus.DELIVERED, {
      id: 'att-1',
      role: UserRole.ATTENDANT,
    });

    expect(prisma.order.update).toHaveBeenCalled();
  });

  it('atendente não pode VALIDATION_PAYMENT → APPROVED', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.VALIDATION_PAYMENT,
      clientId: 'client-1',
      designerId: 'des-1',
      paymentMethod: PaymentMethod.BANK_TRANSFER_SAME,
      paymentProofKey: 'key.pdf',
    });

    await expect(
      service.changeStatus('order-1', OrderStatus.APPROVED, {
        id: 'att-1',
        role: UserRole.ATTENDANT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('designer atribuído pode VALIDATION_PAYMENT → APPROVED', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.VALIDATION_PAYMENT,
      clientId: 'client-1',
      designerId: 'des-1',
      paymentMethod: PaymentMethod.BANK_TRANSFER_SAME,
      paymentProofKey: 'key.pdf',
    });
    prisma.order.update.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.APPROVED,
    });
    prisma.auditLog.create.mockResolvedValue({});

    await service.changeStatus('order-1', OrderStatus.APPROVED, {
      id: 'des-1',
      role: UserRole.DESIGNER,
    });

    expect(prisma.order.update).toHaveBeenCalled();
  });

  it('designer não pode SUBMITTED → VALIDATION_PAYMENT', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.SUBMITTED,
      clientId: 'client-1',
      designerId: 'des-1',
      paymentMethod: PaymentMethod.BANK_TRANSFER_SAME,
      paymentProofKey: 'proof.pdf',
    });

    await expect(
      service.changeStatus('order-1', OrderStatus.VALIDATION_PAYMENT, {
        id: 'des-1',
        role: UserRole.DESIGNER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('designer pode FINISHED → DELIVERED (equipa)', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.FINISHED,
      clientId: 'client-1',
      designerId: 'des-1',
      paymentMethod: PaymentMethod.BANK_TRANSFER_SAME,
      paymentProofKey: 'key.pdf',
      orderOrigin: OrderOrigin.ONLINE,
      draftSharedWithDesignTeam: false,
      items: [{ productionProcess: ProductionProcess.SUBLIMATION }],
    });
    prisma.order.update.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.DELIVERED,
    });
    prisma.auditLog.create.mockResolvedValue({});

    await service.changeStatus('order-1', OrderStatus.DELIVERED, {
      id: 'des-1',
      role: UserRole.DESIGNER,
    });

    expect(prisma.order.update).toHaveBeenCalled();
  });

  it('designer na fila sem atribuição pode VALIDATION_PAYMENT → APPROVED e fica atribuído', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.VALIDATION_PAYMENT,
      clientId: 'client-1',
      designerId: null,
      paymentMethod: PaymentMethod.BANK_TRANSFER_SAME,
      paymentProofKey: 'key.pdf',
      orderOrigin: OrderOrigin.ONLINE,
      draftSharedWithDesignTeam: false,
      items: [{ productionProcess: ProductionProcess.SUBLIMATION }],
    });
    prisma.order.update.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.APPROVED,
    });
    prisma.auditLog.create.mockResolvedValue({});

    await service.changeStatus('order-1', OrderStatus.APPROVED, {
      id: 'des-new',
      role: UserRole.DESIGNER,
    });

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OrderStatus.APPROVED,
          designerId: 'des-new',
        }),
      }),
    );
  });

  it('impede cliente de submeter rascunho via PATCH (usa POST submit)', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.DRAFT,
      clientId: 'client-1',
      designerId: null,
      paymentMethod: null,
      paymentProofKey: null,
    });

    await expect(
      service.changeStatus('order-1', OrderStatus.SUBMITTED, {
        id: 'client-1',
        role: UserRole.CLIENT,
      }),
    ).rejects.toThrow(/POST.*submit/s);
  });

  it('impede cliente alterar pedido de outro cliente', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.DRAFT,
      clientId: 'client-2',
      designerId: null,
      paymentMethod: null,
      paymentProofKey: null,
    });

    await expect(
      service.changeStatus('order-1', OrderStatus.SUBMITTED, {
        id: 'client-1',
        role: UserRole.CLIENT,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('altera status válido e grava auditoria', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.DRAFT,
      clientId: 'client-1',
      designerId: null,
      paymentMethod: null,
      paymentProofKey: null,
    });
    prisma.order.update.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.CANCELLED,
    });
    prisma.auditLog.create.mockResolvedValue({});

    const result = await service.changeStatus(
      'order-1',
      OrderStatus.CANCELLED,
      { id: 'admin-1', role: UserRole.ADMIN },
    );

    expect(result).toEqual(expect.objectContaining({ id: 'order-1' }));
    expect(prisma.order.update).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('impede admin de passar DRAFT para SUBMITTED sem POST submit', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.DRAFT,
      clientId: 'client-1',
      designerId: null,
      paymentMethod: null,
      paymentProofKey: null,
    });

    await expect(
      service.changeStatus('order-1', OrderStatus.SUBMITTED, {
        id: 'admin-1',
        role: UserRole.ADMIN,
      }),
    ).rejects.toThrow(/POST.*submit/s);

    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('retorna NotFound quando pedido não existe', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(
      service.changeStatus('missing', OrderStatus.SUBMITTED, {
        id: 'admin-1',
        role: UserRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('impede admin de definir preço em pedido online', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderOrigin: OrderOrigin.ONLINE,
    });

    await expect(
      service.setOrderPrice('order-1', 1000, undefined, {
        id: 'admin-1',
        role: UserRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('impede cliente de cancelar pedido de balcão', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.SUBMITTED,
      clientId: 'client-1',
      designerId: null,
      paymentMethod: PaymentMethod.BANK_TRANSFER_SAME,
      paymentProofKey: 'key.pdf',
      orderOrigin: OrderOrigin.BALCAO,
      items: [{ productionProcess: ProductionProcess.SUBLIMATION }],
    });

    await expect(
      service.changeStatus('order-1', OrderStatus.CANCELLED, {
        id: 'client-1',
        role: UserRole.CLIENT,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('impede admin de eliminar pedido online', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      clientId: 'client-1',
      status: OrderStatus.DRAFT,
      orderOrigin: OrderOrigin.ONLINE,
      attendantId: null,
    });

    await expect(
      service.deleteOrder('order-1', {
        id: 'admin-1',
        role: UserRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.order.delete).not.toHaveBeenCalled();
  });

  it('atendente no balcão ao submeter vai para VALIDATION_PAYMENT (não APPROVED)', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      clientId: 'client-1',
      status: OrderStatus.DRAFT,
      orderOrigin: OrderOrigin.BALCAO,
      attendantId: 'att-1',
      orderNumber: 'TST-1',
    });
    prisma.orderItem.findMany.mockResolvedValue([
      {
        unitPrice: 100,
        quantity: 1,
        metadata: {},
        productionProcess: ProductionProcess.SUBLIMATION,
      },
    ]);
    prisma.order.update.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.VALIDATION_PAYMENT,
    });
    prisma.auditLog.create.mockResolvedValue({});

    await service.submitOrderWithProof(
      'order-1',
      PaymentMethod.PDV_DEBIT_CARD,
      undefined,
      { id: 'att-1', role: UserRole.ATTENDANT },
    );

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OrderStatus.VALIDATION_PAYMENT,
        }),
      }),
    );
    expect(insumos.descontarPorPedido).not.toHaveBeenCalled();
    expect(finance.recordLedgerEntryForOrderPayment).toHaveBeenCalled();
  });

  it('admin no balcão ao submeter produção vai para VALIDATION_PAYMENT (não APPROVED)', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      clientId: 'client-1',
      status: OrderStatus.DRAFT,
      orderOrigin: OrderOrigin.BALCAO,
      attendantId: 'att-1',
      orderNumber: 'TST-1',
    });
    prisma.orderItem.findMany.mockResolvedValue([
      {
        unitPrice: 100,
        quantity: 1,
        metadata: {},
        productionProcess: ProductionProcess.SUBLIMATION,
      },
    ]);
    prisma.order.update.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.VALIDATION_PAYMENT,
    });
    prisma.auditLog.create.mockResolvedValue({});

    await service.submitOrderWithProof(
      'order-1',
      PaymentMethod.PDV_DEBIT_CARD,
      undefined,
      { id: 'admin-1', role: UserRole.ADMIN },
    );

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OrderStatus.VALIDATION_PAYMENT,
        }),
      }),
    );
    expect(insumos.descontarPorPedido).not.toHaveBeenCalled();
    expect(finance.recordLedgerEntryForOrderPayment).toHaveBeenCalled();
  });
});
