"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import {
  describeDraftResponsibleLine,
  formatModelagemSavedAt,
  getLatestArtVersion,
} from "@/lib/modelagem-authorship";
import { formatMoney } from "@/lib/format-money";
import type { OrderDetail } from "@/lib/api-client";
import { orderIsBalcao } from "@/lib/order-client-mutations";
import { clientNextActionHint } from "@/lib/order-client-ui";
import { contaPedidoPath, isStaffRole } from "@/lib/routes";
import { DesignerResponsibleBanner } from "@/components/order/DesignerResponsibleBanner";

const SM640_QUERY = "(min-width: 640px)";

function subscribeSm640(onChange: () => void) {
  const mq = window.matchMedia(SM640_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSm640Snapshot() {
  return window.matchMedia(SM640_QUERY).matches;
}

function getSm640ServerSnapshot() {
  return false;
}

function Collapsible({
  id,
  title,
  badge,
  defaultOpen = false,
  defaultOpenDesktop = false,
  compact,
  children,
}: {
  id: string;
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  /** Aberto por defeito só em ecrãs ≥ sm (640 px). */
  defaultOpenDesktop?: boolean;
  /** Cabeçalho mais baixo — telemóvel. */
  compact?: boolean;
  children: ReactNode;
}) {
  const isDesktop = useSyncExternalStore(
    subscribeSm640,
    getSm640Snapshot,
    getSm640ServerSnapshot,
  );
  const defaultExpanded = isDesktop ? defaultOpenDesktop || defaultOpen : false;
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const open = userOverride ?? defaultExpanded;

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-zinc-950/40 ring-1 ring-white/[0.03]">
      <button
        type="button"
        id={`${id}-trigger`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setUserOverride((o) => !(o ?? defaultExpanded))}
        className={`flex w-full items-center gap-2 text-left transition hover:bg-white/[0.03] ${
          compact ? "px-2.5 py-2 sm:px-3 sm:py-2.5" : "px-3 py-2.5"
        }`}
      >
        <span
          className={`min-w-0 flex-1 font-semibold uppercase tracking-wider text-zinc-400 ${
            compact ? "text-[10px] sm:text-[11px]" : "text-[11px]"
          }`}
        >
          {title}
        </span>
        {badge ? (
          <span className="shrink-0 rounded-md bg-zinc-800/80 px-1.5 py-0.5 text-[9px] tabular-nums text-zinc-500">
            {badge}
          </span>
        ) : null}
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-zinc-600 transition sm:h-4 sm:w-4 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="M5 7.5L10 12.5L15 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div
          id={`${id}-panel`}
          role="region"
          aria-labelledby={`${id}-trigger`}
          className={`border-t border-white/[0.06] pt-2 ${compact ? "px-2.5 pb-2.5 sm:px-3 sm:pb-3" : "px-3 pb-3"}`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function ContextAlert({
  tone,
  title,
  children,
}: {
  tone: "sky" | "teal" | "amber" | "violet";
  title: string;
  children: ReactNode;
}) {
  const tones = {
    sky: "border-sky-500/35 bg-sky-950/30 text-sky-100/90 ring-sky-500/15",
    teal: "border-teal-500/35 bg-teal-950/25 text-teal-100/95 ring-teal-500/15",
    amber: "border-amber-500/35 bg-amber-950/20 text-amber-100/95 ring-amber-500/15",
    violet: "border-violet-500/30 bg-violet-950/25 text-violet-100/95 ring-violet-500/15",
  };
  return (
    <div
      className={`rounded-xl border px-2.5 py-2 text-[11px] leading-relaxed ring-1 sm:px-3 sm:py-2.5 sm:text-[12px] ${tones[tone]}`}
      role="status"
    >
      <span className="font-semibold">{title}</span> {children}
    </div>
  );
}

export function ModelagemContextSections({
  order,
  userRole,
  viewerUserId,
  isPdvBalcaoModelagem,
  clientModelagemReadOnly,
  unread = 0,
  specsSlot,
}: {
  order: OrderDetail;
  userRole: string;
  viewerUserId: string;
  isPdvBalcaoModelagem: boolean;
  clientModelagemReadOnly: boolean;
  unread?: number;
  specsSlot: ReactNode;
}) {
  const latest = getLatestArtVersion(order.artVersions);
  const draftLine = describeDraftResponsibleLine(order);
  const nextHint = clientNextActionHint(order, unread);
  const total = formatMoney(order.totalAmount, order.currency);

  const alerts: ReactNode[] = [];

  if (order.orderOrigin === "BALCAO" && isStaffRole(userRole)) {
    alerts.push(
      <ContextAlert key="balcao-staff" tone="amber" title="Pedido de balcão · modelagem 2D.">
        {isPdvBalcaoModelagem
          ? " O pagamento e submissão final fazem-se no PDV, após guardar o rascunho aqui."
          : " O atendente pode reabrir este pedido no balcão para concluir com o cliente."}
      </ContextAlert>,
    );
  }

  if (userRole === "CLIENT" && orderIsBalcao(order) && order.status === "DRAFT") {
    alerts.push(
      <ContextAlert key="balcao-client" tone="teal" title="Pedido de balcão.">
        {" "}
        O design é tratado pela equipa no PDV — aqui podes apenas consultar a pré-visualização.
      </ContextAlert>,
    );
  }

  if (userRole === "CLIENT" && order.status !== "DRAFT") {
    alerts.push(
      <ContextAlert key="readonly" tone="sky" title="Modo consulta.">
        {" "}
        O pedido já não está em rascunho — não é possível alterar o design após submissão.
      </ContextAlert>,
    );
  }

  if (clientModelagemReadOnly && userRole !== "CLIENT") {
    alerts.push(
      <ContextAlert key="staff-ro" tone="violet" title="Edição limitada.">
        {" "}
        Composição protegida nesta fase — duplica camadas de modelo designer para editar.
      </ContextAlert>,
    );
  }

  const designerBanner = (
    <DesignerResponsibleBanner
      designer={order.designer}
      viewerRole={userRole}
      viewerId={viewerUserId}
    />
  );

  const hasTopExtras = Boolean(designerBanner) || alerts.length > 0;

  const topExtrasContent = (
    <div className="space-y-2">
      {designerBanner}
      {alerts.length > 0 ? alerts : null}
    </div>
  );

  return (
    <div className="space-y-1.5 sm:space-y-2">
      {hasTopExtras ? (
        <>
          <div className="sm:hidden">
            <Collapsible
              id="modelagem-avisos-mobile"
              title="Avisos e equipa"
              badge={alerts.length > 0 ? String(alerts.length) : undefined}
              compact
            >
              {topExtrasContent}
            </Collapsible>
          </div>
          <div className="hidden space-y-2 sm:block">{topExtrasContent}</div>
        </>
      ) : null}

      <Collapsible
        id="modelagem-pedido-resumo"
        title="Resumo do pedido"
        badge={`${order._count.items} art.`}
        defaultOpenDesktop
        compact
      >
        <div className="space-y-2 text-[12px] text-zinc-300">
          {nextHint ? (
            <p className="rounded-lg border border-amber-500/20 bg-amber-950/20 px-2.5 py-2 text-[11px] text-amber-100/90">
              {nextHint}
            </p>
          ) : null}
          <ul className="space-y-1">
            {order.items.slice(0, 4).map((item) => (
              <li key={item.id} className="flex justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate text-zinc-400">{item.productName}</span>
                <span className="shrink-0 tabular-nums text-zinc-500">×{item.quantity}</span>
              </li>
            ))}
            {order.items.length > 4 ? (
              <li className="text-[10px] text-zinc-600">+{order.items.length - 4} mais</li>
            ) : null}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
            <span className="text-[11px] text-zinc-500">Total estimado</span>
            <span className="text-sm font-semibold tabular-nums text-amber-100">{total}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={contaPedidoPath(order.id)}
              className="rounded-lg border border-zinc-700/50 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 transition hover:bg-zinc-800/60 hover:text-white"
            >
              Ver pedido completo
              {unread > 0 ? (
                <span className="ml-1 rounded-full bg-amber-400/20 px-1.5 text-[9px] text-amber-200">
                  {unread} msg.
                </span>
              ) : null}
            </Link>
          </div>
        </div>
      </Collapsible>

      <Collapsible id="modelagem-authorship" title="Histórico da composição" compact>
        {latest ? (
          <div className="space-y-1 text-[12px] text-zinc-300">
            <p>
              Última gravação por{" "}
              <span className="font-semibold text-white">
                {latest.createdBy?.name?.trim() || "Utilizador"}
              </span>{" "}
              (v<span className="tabular-nums">{latest.versionIndex}</span>).
            </p>
            <p className="text-[11px] text-zinc-500">
              {formatModelagemSavedAt(latest.createdAt)}
            </p>
            {order.status === "DRAFT" && draftLine ? (
              <p className="border-t border-white/[0.06] pt-2 text-[11px] text-zinc-500">
                {draftLine}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-[11px] text-zinc-500">
            Ainda não há versões guardadas neste editor.
          </p>
        )}
      </Collapsible>

      <Collapsible id="modelagem-specs" title="Notas para a equipa" compact>
        {specsSlot}
      </Collapsible>

    </div>
  );
}
