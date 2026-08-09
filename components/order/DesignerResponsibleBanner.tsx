"use client";

import Link from "next/link";
import { ROUTES, normalizeUserRole } from "@/lib/routes";

export type OrderDesignerBrief =
  | { id: string; name: string; email?: string | null }
  | null
  | undefined;

/**
 * Aviso explícito sobre quem é o designer responsável no pedido, para evitar
 * trabalho paralelo e desperdício de material. API já bloqueia segundo «claim».
 */
export function DesignerResponsibleBanner({
  designer,
  viewerRole,
  viewerId,
}: {
  designer: OrderDesignerBrief;
  viewerRole: string;
  viewerId: string;
}) {
  const role = normalizeUserRole(viewerRole);

  if (role === "CLIENT") return null;

  const hasDesigner = Boolean(designer?.id);
  const isSelf =
    role === "DESIGNER" && Boolean(viewerId && designer?.id === viewerId);
  const isOtherDesigner =
    role === "DESIGNER" &&
    Boolean(viewerId && designer?.id && designer.id !== viewerId);

  if (role === "DESIGNER" && isOtherDesigner) {
    return (
      <div
        className="rounded-2xl border border-amber-500/45 bg-amber-950/35 px-4 py-3 text-[13px] leading-relaxed text-amber-50 ring-1 ring-amber-400/20"
        role="alert"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400/95">
          Responsável por este pedido (outro designer)
        </p>
        <p className="mt-2">
          Este trabalho está atribuído a{" "}
          <span className="font-semibold text-white">
            {designer!.name?.trim() || "Designer"}
          </span>
          . Não continue a produzir arte nem peça material para esta referência em
          paralelo — coordene com esta pessoa ou restrinja-se a consultar.
        </p>
        <p className="mt-2 text-[12px] text-amber-100/80">
          Para assumir pedidos livres, use «Atribuir a mim» apenas na fila sem
          responsável.
        </p>
        <Link
          href={ROUTES.admin.designer}
          className="mt-3 inline-flex text-xs font-semibold text-amber-200 underline-offset-2 hover:underline"
        >
          Abrir Ferramentas de designer
        </Link>
      </div>
    );
  }

  if (role === "DESIGNER" && isSelf) {
    return (
      <div
        className="rounded-2xl border border-teal-500/35 bg-teal-950/25 px-4 py-3 text-[13px] leading-relaxed text-teal-50/95 ring-1 ring-teal-500/15"
        role="status"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-400/90">
          É o seu pedido na fila
        </p>
        <p className="mt-1.5">
          Está registado como designer responsável neste pedido. A equipa deve
          ver o seu nome na lista — evite que outro colega trabalhe a mesma
          referência em paralelo.
        </p>
      </div>
    );
  }

  if (role === "DESIGNER" && !hasDesigner) {
    return (
      <div
        className="rounded-2xl border border-violet-500/35 bg-violet-950/30 px-4 py-3 text-[13px] leading-relaxed text-violet-50/95 ring-1 ring-violet-400/18"
        role="status"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-400/90">
          Ainda sem designer atribuído
        </p>
        <p className="mt-1.5">
          Antes de produzir em série ou consumir material, atribua o pedido a si
          em{" "}
          <Link
            href={ROUTES.admin.designer}
            className="font-semibold text-violet-200 underline-offset-2 hover:underline"
          >
            Ferramentas de designer
          </Link>{" "}
          («Atribuir a mim»). Assim toda a equipa vê quem está com o trabalho e
          evita duplicação.
        </p>
      </div>
    );
  }

  if (role === "ADMIN") {
    return (
      <div
        className="rounded-2xl border border-zinc-600/45 bg-zinc-900/55 px-4 py-3 text-[13px] leading-relaxed text-zinc-200 ring-1 ring-white/[0.06]"
        role="status"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Designer no pedido (sistema)
        </p>
        <p className="mt-1.5">
          {hasDesigner ? (
            <>
              Responsável:{" "}
              <span className="font-semibold text-white">
                {designer!.name?.trim()}
              </span>
              {designer!.email ? (
                <span className="text-zinc-500">
                  {" "}
                  · {designer!.email}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-zinc-400">
              Nenhum designer atribuído — na fila criativa vários perfis podem ver
              o pedido até alguém o reclamar.
            </span>
          )}
        </p>
      </div>
    );
  }

  if (role === "ATTENDANT") {
    return (
      <div
        className="rounded-2xl border border-zinc-600/40 bg-zinc-900/40 px-4 py-2.5 text-[12px] text-zinc-300 ring-1 ring-white/[0.05]"
        role="status"
      >
        {hasDesigner ? (
          <>
            <span className="text-zinc-500">Designer atribuído: </span>
            <span className="font-semibold text-zinc-100">
              {designer!.name?.trim()}
            </span>
          </>
        ) : (
          <span className="text-zinc-500">
            Ainda sem designer atribuído ao pedido.
          </span>
        )}
      </div>
    );
  }

  return null;
}

/** Célula compacta para tabelas (Ferramentas de designer). */
export function DesignerResponsibleBadge({
  designer,
  viewerId,
  viewerRole,
  claimVisible,
}: {
  designer: OrderDesignerBrief;
  viewerId: string;
  viewerRole: string;
  claimVisible: boolean;
}) {
  const role = normalizeUserRole(viewerRole);

  if (designer?.id) {
    const self = role === "DESIGNER" && viewerId && designer.id === viewerId;
    const other = role === "DESIGNER" && viewerId && designer.id !== viewerId;
    return (
      <div className="min-w-0">
        <p
          className={`truncate font-medium ${
            other
              ? "text-amber-200"
              : self
                ? "text-teal-200"
                : "text-zinc-200"
          }`}
          title={designer.name ?? undefined}
        >
          {designer.name?.trim() || "—"}
        </p>
        <p className="mt-0.5 text-[10px] leading-tight text-zinc-600">
          {other
            ? "Outro designer — não assuma produção em paralelo"
            : self
              ? "À sua conta neste pedido"
              : "Responsável na fila"}
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <p className="font-medium text-zinc-500">—</p>
      <p className="mt-0.5 text-[10px] text-zinc-600">
        {claimVisible && role === "DESIGNER"
          ? "Sem responsável · pode reclamar"
          : role === "DESIGNER"
            ? "Sem responsável neste pedido"
            : "Sem designer"}
      </p>
    </div>
  );
}
