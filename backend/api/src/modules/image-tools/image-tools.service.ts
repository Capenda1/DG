import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Replicate, { type FileOutput } from 'replicate';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Real‑ESRGAN no Replicate (versão pinada pelo digest). */
const REPLICATE_ENHANCE_MODEL =
  'nightmareai/real-esrgan:279a18ae4f30c9d3636516918d76c8c8262a9bc7c415fe90a88087c78c9ebbef';

/** Modelo pré‑definido Upscayl Cloud (fotografia). */
const UPSCAYL_ENHANCE_MODEL = 'natural-plus-4x';

/** Identificadores expostos ao cliente (`GET enhance-ai/status`). */
export type ImageEnhanceAiBackendId = 'replicate' | 'upscayl';

export type AiEnhanceStatusDto = {
  available: boolean;
  backend: ImageEnhanceAiBackendId | null;
};

export type UpscaleAiOptions = {
  buffer: Buffer;
  mimeType: string;
  scale: 2 | 4;
  faceEnhance: boolean;
};

function coerceReplicateOutputToUrl(output: unknown): string | null {
  if (output == null) return null;
  if (typeof output === 'string' && /^https?:\/\//i.test(output)) return output;
  if (typeof output === 'string' && output.startsWith('data:')) return output;
  if (Array.isArray(output) && output.length > 0) {
    return coerceReplicateOutputToUrl(output[0]);
  }
  if (
    typeof output === 'object' &&
    output !== null &&
    'url' in output &&
    typeof (output as FileOutput).url === 'function'
  ) {
    const u = (output as FileOutput).url();
    return typeof u === 'string' ? u : u.toString();
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pickUpscaylDownloadUrl(files: unknown[] | undefined): string | null {
  if (!Array.isArray(files) || files.length === 0) return null;
  for (const item of files) {
    const o =
      typeof item === 'object' && item !== null
        ? (item as Record<string, unknown>)
        : {};
    for (const k of [
      'signedUrl',
      'downloadUrl',
      'presignedUrl',
      'url',
      'fileUrl',
    ]) {
      const v = o[k];
      if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
    }
    const p = o.path;
    if (typeof p === 'string' && /^https?:\/\//i.test(p)) return p;
  }
  return null;
}

function uploadFileNameForMime(mt: string): string {
  if (mt === 'image/jpeg') return 'upload.jpg';
  if (mt === 'image/webp') return 'upload.webp';
  return 'upload.png';
}

@Injectable()
export class ImageToolsService {
  private readonly log = new Logger(ImageToolsService.name);

  constructor(private readonly config: ConfigService) {}

  private hasReplicate(): boolean {
    const t = this.config.get<string>('replicate.apiToken') ?? '';
    return t.trim().length >= 16;
  }

  private hasUpscayl(): boolean {
    const k = this.config.get<string>('upscayl.apiKey') ?? '';
    return k.trim().length >= 8;
  }

  resolveActiveAiBackend(): ImageEnhanceAiBackendId | null {
    const provRaw = this.config.get<string>('imageEnhance.provider') ?? 'auto';
    const mode = String(provRaw).toLowerCase().trim();
    const canR = this.hasReplicate();
    const canU = this.hasUpscayl();
    if (mode === 'replicate') return canR ? 'replicate' : null;
    if (mode === 'upscayl') return canU ? 'upscayl' : null;
    if (canR) return 'replicate';
    if (canU) return 'upscayl';
    return null;
  }

  getAiUpscaleMeta(): AiEnhanceStatusDto {
    const backend = this.resolveActiveAiBackend();
    return { available: backend != null, backend };
  }

  /** @deprecated utilizar `getAiUpscaleMeta()` */
  isAiUpscaleConfigured(): boolean {
    return this.resolveActiveAiBackend() != null;
  }

  private maxAiBytes(): number {
    return (
      parseInt(process.env.MAX_AI_ENHANCE_UPLOAD_MB ?? '12', 10) * 1024 * 1024
    );
  }

  private assertRasterOk(buffer: Buffer, mimeType: string): string {
    const mt = mimeType.toLowerCase().split(';')[0].trim();
    if (!ALLOWED_IMAGE_MIME.has(mt)) {
      throw new BadRequestException(
        'Tipo de imagem não suportado. Utilize PNG, JPEG ou WebP.',
      );
    }
    if (buffer.length > this.maxAiBytes()) {
      throw new BadRequestException(
        `Ficheiro demasiado grande (máximo ${Math.round(this.maxAiBytes() / 1024 / 1024)} MB para IA).`,
      );
    }
    return mt;
  }

  async upscaleImageWithAi(
    opts: UpscaleAiOptions,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const backend = this.resolveActiveAiBackend();
    if (!backend) {
      throw new ServiceUnavailableException(
        'Configure REPLICATE_API_TOKEN ou UPSCAYL_API_KEY neste servidor.',
      );
    }
    if (backend === 'replicate') return this.upscaleImageWithReplicate(opts);
    return this.upscaleImageWithUpscaylCloud(opts);
  }

  async upscaleImageWithReplicate(
    opts: UpscaleAiOptions,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const { buffer, mimeType, scale, faceEnhance } = opts;
    const mt = this.assertRasterOk(buffer, mimeType);
    if (!this.hasReplicate()) {
      throw new ServiceUnavailableException('Replicate não está configurado.');
    }

    const token = this.config.get<string>('replicate.apiToken')!.trim();

    const replicate = new Replicate({ auth: token });
    const dataUri = `data:${mt};base64,${buffer.toString('base64')}`;

    let outputUrl: string | null = null;
    try {
      const out = await replicate.run(
        REPLICATE_ENHANCE_MODEL as `${string}/${string}:${string}`,
        {
          input: {
            image: dataUri,
            scale,
            face_enhance: faceEnhance,
          },
        },
      );
      outputUrl = coerceReplicateOutputToUrl(out);
      if (!outputUrl) {
        throw new BadRequestException(
          'A API Replicate não devolveu uma imagem reconhecível.',
        );
      }
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof ServiceUnavailableException
      ) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`Replicate falhou: ${msg}`);
      if (
        msg.includes('timeout') ||
        msg.includes('timed out') ||
        msg.includes('503')
      ) {
        throw new ServiceUnavailableException(
          'O serviço de IA está ocupado — tente novamente brevemente.',
        );
      }
      throw new BadRequestException(`IA (Replicate): ${msg.slice(0, 400)}`);
    }
    return this.downloadResultBuffer(outputUrl, 'Replicate');
  }

  async upscaleImageWithUpscaylCloud(
    opts: UpscaleAiOptions,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const { buffer, mimeType, scale, faceEnhance } = opts;
    const mt = this.assertRasterOk(buffer, mimeType);

    const apiKey = (this.config.get<string>('upscayl.apiKey') ?? '').trim();
    const baseUrl = (
      this.config.get<string>('upscayl.apiBaseUrl') ?? 'https://api.upscayl.org'
    ).replace(/\/$/, '');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'UPSCAYL_API_KEY não está definido.',
      );
    }

    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: mt }),
      uploadFileNameForMime(mt),
    );
    form.append('model', UPSCAYL_ENHANCE_MODEL);
    form.append('scale', String(scale));
    form.append('saveImageAs', 'png');
    form.append('enhanceFace', faceEnhance ? 'true' : 'false');

    let taskId: string;
    try {
      const start = await fetch(`${baseUrl}/start-task`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
        body: form,
      });
      const startText = await start.text();
      let startJson: { status?: string; data?: { taskId?: string } };
      try {
        startJson = JSON.parse(startText) as typeof startJson;
      } catch {
        throw new BadRequestException(
          `Upscayl: resposta inválida (${start.status})`,
        );
      }
      if (
        !start.ok ||
        startJson.status !== 'success' ||
        !startJson.data?.taskId
      ) {
        const hint = startText.slice(0, 300);
        if (start.status === 402) {
          throw new BadRequestException('Upscayl: créditos insuficientes.');
        }
        throw new BadRequestException(
          `Upscayl: falha ao iniciar tarefa — ${hint}`,
        );
      }
      taskId = startJson.data.taskId;
    } catch (e) {
      if (
        e instanceof BadRequestException ||
        e instanceof ServiceUnavailableException
      ) {
        throw e;
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(`Upscayl (início): ${msg.slice(0, 380)}`);
    }

    const deadlineMs = Date.now() + 180_000;

    while (Date.now() < deadlineMs) {
      await sleep(2000);
      try {
        const stRes = await fetch(`${baseUrl}/get-task-status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          body: JSON.stringify({ data: { taskId } }),
        });

        let stPayload: {
          status?: string;
          data?: { status?: string; files?: unknown[] };
        };
        try {
          stPayload = (await stRes.json()) as typeof stPayload;
        } catch {
          continue;
        }

        const st =
          typeof stPayload.data?.status === 'string'
            ? stPayload.data.status
            : '';

        if (st === 'PROCESSING_FAILED') {
          throw new BadRequestException(
            'Upscayl reportou erro ao processar a imagem.',
          );
        }
        if (st !== 'PROCESSED') continue;

        const downloadUrl = pickUpscaylDownloadUrl(stPayload.data?.files);
        if (!downloadUrl) {
          this.log.warn(
            `Upscayl PROCESSED sem URL compatível — amostra: ${JSON.stringify(stPayload.data?.files)?.slice(0, 500)}`,
          );
          throw new BadRequestException(
            'Upscayl terminou mas a resposta não contém uma URL de download reconhecível — verifique logs do servidor.',
          );
        }

        return this.downloadResultBuffer(downloadUrl, 'Upscayl');
      } catch (e) {
        if (
          e instanceof BadRequestException ||
          e instanceof ServiceUnavailableException
        ) {
          throw e;
        }
        this.log.warn(
          `Upscayl poll: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    throw new ServiceUnavailableException(
      'Tempo máximo ultrapassado à espera do Upscayl Cloud.',
    );
  }

  private async downloadResultBuffer(
    outputUrl: string,
    provider: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    if (outputUrl.startsWith('data:')) {
      const m = outputUrl.match(/^data:([^;]+);base64,(.+)$/i);
      if (!m?.[2]) {
        throw new BadRequestException(
          'Resposta IA em formato base64 inválido.',
        );
      }
      const ctype = (m[1] ?? 'image/png').trim();
      const bufOut = Buffer.from(m[2], 'base64');
      return { buffer: bufOut, contentType: ctype };
    }

    const resImg = await fetch(outputUrl);
    if (!resImg.ok) {
      throw new ServiceUnavailableException(
        `Não foi possível transferir o resultado (${provider}).`,
      );
    }
    const ct =
      resImg.headers.get('content-type')?.split(';')[0]?.trim() ?? 'image/png';
    const outBuf = Buffer.from(await resImg.arrayBuffer());
    return {
      buffer: outBuf,
      contentType: ALLOWED_IMAGE_MIME.has(ct) ? ct : 'image/png',
    };
  }
}
