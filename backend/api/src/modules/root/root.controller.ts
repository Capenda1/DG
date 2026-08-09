import { Controller, Get } from '@nestjs/common';

@Controller()
export class RootController {
  @Get()
  root() {
    return {
      service: 'dadiva-api',
      health: '/api/health',
      auth: {
        bootstrap:
          'POST /api/auth/bootstrap (só quando não há utilizadores; em produção exige x-bootstrap-token)',
        login: 'POST /api/auth/login',
        refresh: 'POST /api/auth/refresh',
        me: 'GET /api/auth/me',
      },
      admin:
        'GET/POST/PATCH/DELETE /api/admin/users[/:id][/reset-password] (JWT admin; GET aceita ?q=&role=&excludeRole=&includeOrderCount=)',
      orders:
        'GET/POST /api/orders, GET/PATCH .../orders/:id[/status], GET/POST/DELETE .../modelagem/files[/:fileId], POST .../modelagem/composition (PNG base64) (JWT)',
      message:
        'API Dádiva Go. Rotas REST sob /api; modelo em prisma/schema.prisma.',
    };
  }
}
