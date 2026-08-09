import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { assertEnvForStartup } from './config/env-validation';
import { AppModule } from './app.module';

/** Base64 PNG pode ultrapassar o default do Express (~100kb); alinhar com SaveCompositionDto (~16MB úteis). */
const JSON_BODY_LIMIT = '25mb';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  try {
    assertEnvForStartup();
  } catch (err) {
    logger.error(
      `Variáveis de ambiente inválidas — a API não vai iniciar.\n${(err as Error).message}`,
    );
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.set('trust proxy', 1);
  app.use(json({ limit: JSON_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()',
    );
    if (process.env.NODE_ENV === 'production') {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains',
      );
    }
    next();
  });

  const config = app.get(ConfigService);
  config.getOrThrow<string>('jwt.secret');

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
  const isDev = process.env.NODE_ENV !== 'production';

  app.enableCors({
    /**
     * Em desenvolvimento aceita qualquer origin para permitir acesso via IP na LAN.
     * Em produção usa o valor exacto de CORS_ORIGIN (validado em assertEnvForStartup).
     */
    origin: isDev
      ? (
          _origin: string | undefined,
          cb: (e: Error | null, allow?: boolean) => void,
        ) => cb(null, true)
      : config.get<string | string[]>('corsOrigin'),
    credentials: true,
  });

  const port = config.get<number>('port') ?? 4000;
  await app.listen(port);
  logger.log(`API em execução em http://localhost:${port}/api`);
}

void bootstrap().catch((err: unknown) => {
  logger.error('Erro crítico no arranque da API:', err);
  process.exit(1);
});
