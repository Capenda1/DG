import { BadRequestException } from '@nestjs/common';

/** Contrato estável persistido em `orders.modelagem_specs` (campo Json). */

export type ModelagemSpecLinhaPersist = {
  id: string;
  nome: string;
  tamanho: string;
  cor: string;
  infoAdicional: string;
  /** Impressão aplicável: frente, costas ou ambos — útil quando o pedido mistura versos. */
  lado: 'AMBOS' | 'FRENTE' | 'VERSO';
};

export type OrderModelagemSpecsV1 = {
  v: 1;
  textoExtra?: string;
  linhas: ModelagemSpecLinhaPersist[];
};

const MAX_EXTRA = 12_000;
const MAX_LINHAS = 120;
const MAX_FIELD = 500;

export function parseAndValidateModelagemSpecs(
  raw: unknown,
): OrderModelagemSpecsV1 {
  if (
    raw == null ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    typeof (raw as OrderModelagemSpecsV1).v !== 'number' ||
    (raw as OrderModelagemSpecsV1).v !== 1
  ) {
    throw new BadRequestException(
      'Formato inválido: esperado { v: 1, linhas: [...] }.',
    );
  }

  const o = raw as Partial<OrderModelagemSpecsV1>;
  const texto =
    o.textoExtra === undefined || o.textoExtra === null
      ? ''
      : String(o.textoExtra);
  if (texto.length > MAX_EXTRA) {
    throw new BadRequestException(
      `textoExtra: máximo ${MAX_EXTRA} caracteres.`,
    );
  }

  if (!Array.isArray(o.linhas)) {
    throw new BadRequestException('linhas deve ser uma lista.');
  }
  if (o.linhas.length > MAX_LINHAS) {
    throw new BadRequestException(`Máximo ${MAX_LINHAS} linhas.`);
  }

  const allowedLado = new Set(['AMBOS', 'FRENTE', 'VERSO']);
  const linhas: ModelagemSpecLinhaPersist[] = [];

  for (let i = 0; i < o.linhas.length; i++) {
    const row = o.linhas[i];
    if (row == null || typeof row !== 'object' || Array.isArray(row)) {
      throw new BadRequestException(`Linha ${i + 1}: objecto inválido.`);
    }
    const r = row as Record<string, unknown>;
    const nome = truncateField(r.nome, 'nome', MAX_FIELD);
    const tamanho = truncateField(r.tamanho, 'tamanho', MAX_FIELD);
    const cor = truncateField(r.cor, 'cor', MAX_FIELD);
    const infoAdicional = truncateField(
      r.infoAdicional,
      'infoAdicional',
      MAX_FIELD,
    );
    const ladoRaw =
      typeof r.lado === 'string' ? r.lado.trim().toUpperCase() : 'AMBOS';
    const lado =
      ladoRaw === 'FRONT'
        ? 'FRENTE'
        : ladoRaw === 'BACK'
          ? 'VERSO'
          : ladoRaw === 'AMBOS'
            ? 'AMBOS'
            : ladoRaw === 'FRENTE' || ladoRaw === 'VERSO'
              ? ladoRaw
              : 'AMBOS';

    const id =
      typeof r.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(r.id)
        ? r.id
        : `l${i}-${randomId()}`;
    const ladoFinal = allowedLado.has(lado) ? lado : 'AMBOS';

    linhas.push({
      id,
      nome,
      tamanho,
      cor,
      infoAdicional,
      lado: ladoFinal,
    });
  }

  return { v: 1, textoExtra: texto || undefined, linhas };
}

function truncateField(raw: unknown, label: string, max: number): string {
  const s =
    raw === undefined || raw === null
      ? ''
      : typeof raw === 'string'
        ? raw.trim()
        : typeof raw === 'number' || typeof raw === 'boolean'
          ? String(raw).trim()
          : '';
  if (s.length > max) {
    throw new BadRequestException(`${label}: máximo ${max} caracteres.`);
  }
  return s;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}
