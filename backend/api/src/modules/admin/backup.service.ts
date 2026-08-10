import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
} from 'fs';
import { mkdir, readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';

export type BackupKind = 'database' | 'uploads' | 'full';

export type BackupFileInfo = {
  name: string;
  kind: 'database' | 'uploads';
  sizeBytes: number;
};

const NAME_RE =
  /^(postgres|uploads)-\d{4}-\d{2}-\d{2}_\d{4}\.(sql\.gz|tar\.gz)$/;

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private readonly stagingDir: string;

  constructor(private readonly config: ConfigService) {
    this.stagingDir = join(tmpdir(), 'dadiva-backups');
  }

  onModuleInit(): void {
    mkdirSync(this.stagingDir, { recursive: true });
    void this.cleanupStale(60);
  }

  assertSafeName(name: string): string {
    const base = name.split(/[/\\]/).pop() ?? '';
    if (!NAME_RE.test(base)) {
      throw new BadRequestException('Nome de backup inválido.');
    }
    return base;
  }

  async create(kind: BackupKind): Promise<{ files: BackupFileInfo[] }> {
    await mkdir(this.stagingDir, { recursive: true });
    await this.cleanupStale(60);

    const stamp = this.stamp();
    const files: BackupFileInfo[] = [];

    if (kind === 'database' || kind === 'full') {
      files.push(await this.createDatabaseBackup(stamp));
    }
    if (kind === 'uploads' || kind === 'full') {
      files.push(await this.createUploadsBackup(stamp));
    }

    return { files };
  }

  async resolveDownload(name: string): Promise<{
    absolutePath: string;
    downloadName: string;
    sizeBytes: number;
  }> {
    const safe = this.assertSafeName(name);
    const absolutePath = join(this.stagingDir, safe);
    if (!existsSync(absolutePath)) {
      throw new NotFoundException(
        'Backup não encontrado ou já foi descarregado.',
      );
    }
    return {
      absolutePath,
      downloadName: safe,
      sizeBytes: statSync(absolutePath).size,
    };
  }

  async removeAfterDownload(absolutePath: string): Promise<void> {
    try {
      await unlink(absolutePath);
    } catch {
      /* já removido */
    }
  }

  private stamp(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  private async createDatabaseBackup(stamp: string): Promise<BackupFileInfo> {
    const name = `postgres-${stamp}.sql.gz`;
    const outPath = join(this.stagingDir, name);
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new BadRequestException('DATABASE_URL não está configurada.');
    }

    const conn = databaseUrl.split('?')[0];
    const env = this.pgDumpEnv(databaseUrl);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        void unlink(outPath).catch(() => undefined);
        reject(err);
      };
      const ok = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const dump = spawn(
        'pg_dump',
        ['--no-owner', '--no-acl', '--clean', '--if-exists', '--dbname', conn],
        {
          env: { ...process.env, ...env },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let stderr = '';
      dump.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      dump.on('error', (err) => {
        fail(
          new Error(
            `pg_dump indisponível (${err.message}). A imagem da API precisa de postgresql-client.`,
          ),
        );
      });

      const gzip = createGzip();
      const out = createWriteStream(outPath);

      void pipeline(dump.stdout, gzip, out).then(ok).catch((err: Error) => {
        fail(err);
      });

      dump.on('close', (code) => {
        if (code && code !== 0) {
          fail(
            new Error(
              `pg_dump saiu com código ${code}: ${stderr.trim() || 'sem detalhe'}`,
            ),
          );
        }
      });
    });

    const st = await stat(outPath);
    this.logger.log(`Backup BD criado: ${name} (${st.size} bytes)`);
    return { name, kind: 'database', sizeBytes: st.size };
  }

  private async createUploadsBackup(stamp: string): Promise<BackupFileInfo> {
    const name = `uploads-${stamp}.tar.gz`;
    const outPath = join(this.stagingDir, name);
    const uploadDir = this.config.get<string>('uploadDir') ?? 'uploads';
    const absUpload = join(process.cwd(), uploadDir);

    if (!existsSync(absUpload)) {
      mkdirSync(absUpload, { recursive: true });
    }

    await new Promise<void>((resolve, reject) => {
      const tar = spawn('tar', ['czf', outPath, '-C', absUpload, '.'], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      tar.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      tar.on('error', (err) => {
        reject(new Error(`tar falhou: ${err.message}`));
      });
      tar.on('close', (code) => {
        if (code === 0) resolve();
        else
          reject(
            new Error(
              `tar saiu com código ${code}: ${stderr.trim() || 'sem detalhe'}`,
            ),
          );
      });
    });

    const st = await stat(outPath);
    this.logger.log(`Backup uploads criado: ${name} (${st.size} bytes)`);
    return { name, kind: 'uploads', sizeBytes: st.size };
  }

  private pgDumpEnv(databaseUrl: string): Record<string, string> {
    try {
      const u = new URL(databaseUrl);
      const env: Record<string, string> = {};
      if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
      return env;
    } catch {
      return {};
    }
  }

  private async cleanupStale(maxAgeMinutes: number): Promise<void> {
    try {
      const entries = await readdir(this.stagingDir);
      const cutoff = Date.now() - maxAgeMinutes * 60_000;
      for (const entry of entries) {
        if (!NAME_RE.test(entry)) continue;
        const p = join(this.stagingDir, entry);
        try {
          const st = await stat(p);
          if (st.mtimeMs < cutoff) await unlink(p);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }
}
