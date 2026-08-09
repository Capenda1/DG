/**
 * Contrato espelha `orders.modelagem_specs` (API v1) — usado só no frontend.
 */
export type ModelagemSpecLado = "AMBOS" | "FRENTE" | "VERSO";

export type ModelagemSpecLinhaEditor = {
  id: string;
  nome: string;
  tamanho: string;
  cor: string;
  infoAdicional: string;
  lado: ModelagemSpecLado;
};

export type ParsedModelagemSpecs = {
  textoExtra: string;
  linhas: ModelagemSpecLinhaEditor[];
};

/** Payload enviado no PATCH `/orders/:id/modelagem/specs` */
export type OrderModelagemSpecsPayload = {
  v: 1;
  textoExtra?: string;
  linhas: Omit<ModelagemSpecLinhaEditor, never>[];
};

export function parseModelagemSpecsFromOrder(
  raw: unknown,
): ParsedModelagemSpecs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { textoExtra: "", linhas: [] };
  }
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return { textoExtra: "", linhas: [] };
  const textoExtra =
    typeof o.textoExtra === "string" ? o.textoExtra : "";
  const rawLinhas = Array.isArray(o.linhas) ? o.linhas : [];

  const linhas: ModelagemSpecLinhaEditor[] = rawLinhas
    .map((row, i) => normalizeLinha(row, i))
    .filter(Boolean) as ModelagemSpecLinhaEditor[];

  return { textoExtra, linhas };
}

function normalizeLinha(
  row: unknown,
  index: number,
): ModelagemSpecLinhaEditor | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  const ladoRaw =
    typeof r.lado === "string" ? r.lado.trim().toUpperCase() : "AMBOS";
  let lado: ModelagemSpecLado = "AMBOS";
  if (ladoRaw === "FRENTE" || ladoRaw === "VERSO") lado = ladoRaw;
  if (ladoRaw === "FRONT") lado = "FRENTE";
  if (ladoRaw === "BACK") lado = "VERSO";

  const id =
    typeof r.id === "string" && r.id.trim()
      ? r.id.trim()
      : `linha-${index}-${randomId()}`;

  return {
    id,
    nome: stringifyField(r.nome),
    tamanho: stringifyField(r.tamanho),
    cor: stringifyField(r.cor),
    infoAdicional: stringifyField(r.infoAdicional),
    lado,
  };
}

function stringifyField(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v);
}

export function novoModelagemLinhaVazia(): ModelagemSpecLinhaEditor {
  return {
    id: `nova-${randomId()}`,
    nome: "",
    tamanho: "",
    cor: "",
    infoAdicional: "",
    lado: "AMBOS",
  };
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function toPayloadParsed(
  textoExtra: string,
  linhas: ModelagemSpecLinhaEditor[],
): OrderModelagemSpecsPayload {
  return {
    v: 1,
    textoExtra: textoExtra.trim() || undefined,
    linhas: linhas.map(({ id, nome, tamanho, cor, infoAdicional, lado }) => ({
      id,
      nome: nome.trim(),
      tamanho: tamanho.trim(),
      cor: cor.trim(),
      infoAdicional: infoAdicional.trim(),
      lado,
    })),
  };
}
