import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

const E2E_ADMIN_EMAIL = 'e2e_admin@example.test';
const E2E_ADMIN_PASSWORD = 'senha123456';

type Tokens = { accessToken: string };

/** Garante admin de teste (base vazia ou já populada). */
beforeAll(async () => {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash(E2E_ADMIN_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: E2E_ADMIN_EMAIL },
    create: {
      email: E2E_ADMIN_EMAIL,
      name: 'E2E Admin',
      passwordHash: hash,
      role: UserRole.ADMIN,
    },
    update: {
      passwordHash: hash,
      role: UserRole.ADMIN,
    },
  });
  await prisma.$disconnect();
});

async function getAdminAccessToken(
  server: Parameters<typeof request>[0],
): Promise<string> {
  const login = await request(server).post('/api/auth/login').send({
    email: E2E_ADMIN_EMAIL,
    password: E2E_ADMIN_PASSWORD,
  });
  expect(login.status).toBe(200);
  return (login.body as Tokens).accessToken;
}

describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const config = app.get(ConfigService);
    app.setGlobalPrefix('api', {
      exclude: [{ path: '/', method: RequestMethod.GET }],
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.enableCors({
      origin: config.get<string>('corsOrigin'),
      credentials: true,
    });
    await app.init();
  });

  it('GET /', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((res) => {
        const body = res.body as {
          service: string;
          health: string;
          orders: string;
        };
        expect(body.service).toBe('dadiva-api');
        expect(body.health).toBe('/api/health');
        expect(body.orders).toContain('/api/orders');
      });
  });

  it('GET /api/health', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        const body = res.body as { status: string; service: string };
        expect(body.status).toBe('ok');
        expect(body.service).toBe('dadiva-api');
      });
  });

  it('GET /api/orders without token → 401', () => {
    return request(app.getHttpServer()).get('/api/orders').expect(401);
  });

  it('admin cria utilizador + GET /api/orders com Bearer do cliente', async () => {
    const adminToken = await getAdminAccessToken(app.getHttpServer());
    const email = `e2e_${Date.now()}@example.test`;
    const created = await request(app.getHttpServer())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email,
        name: 'E2E User',
        password: 'senha123456',
        role: UserRole.CLIENT,
      })
      .expect(201);
    const userId = (created.body as { user: { id: string } }).user.id;
    expect(userId).toBeDefined();

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email,
        password: 'senha123456',
      })
      .expect(200);
    const accessToken = (login.body as Tokens).accessToken;
    return request(app.getHttpServer())
      .get('/api/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
      });
  });

  it('GET /api/orders retorna apenas pedidos do cliente autenticado', async () => {
    const stamp = Date.now();
    const adminToken = await getAdminAccessToken(app.getHttpServer());
    const userAEmail = `orders_a_${stamp}@example.test`;
    const userBEmail = `orders_b_${stamp}@example.test`;

    await request(app.getHttpServer())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: userAEmail,
        name: 'Cliente A',
        password: 'senha123456',
        role: UserRole.CLIENT,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: userBEmail,
        name: 'Cliente B',
        password: 'senha123456',
        role: UserRole.CLIENT,
      })
      .expect(201);

    const loginA = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: userAEmail,
        password: 'senha123456',
      })
      .expect(200);
    const regA = loginA.body as Tokens & {
      user: { id: string };
    };

    const loginB = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: userBEmail,
        password: 'senha123456',
      })
      .expect(200);
    const userBId = (loginB.body as { user: { id: string } }).user.id;

    const prisma = new PrismaClient();
    await prisma.$connect();

    await prisma.order.create({
      data: {
        orderNumber: `E2E-A-${stamp}`,
        clientId: regA.user.id,
      },
    });
    await prisma.order.create({
      data: {
        orderNumber: `E2E-B-${stamp}`,
        clientId: userBId,
      },
    });

    const listA = await request(app.getHttpServer())
      .get('/api/orders')
      .set('Authorization', `Bearer ${regA.accessToken}`)
      .expect(200);
    const orders = listA.body as Array<{ client: { id: string } }>;

    expect(Array.isArray(orders)).toBe(true);
    expect(orders.length).toBeGreaterThan(0);
    expect(
      orders.every((order) => {
        return order.client.id === regA.user.id;
      }),
    ).toBe(true);
    await prisma.$disconnect();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });
});
