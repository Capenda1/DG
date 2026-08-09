"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminListOrders,
  getOrder,
  type AdminOrderListRow,
} from "@/lib/api-client";
import { loadSession } from "@/lib/auth-session";
import { FacturasLifecycleFlow } from "@/components/admin/FacturasLifecycleFlow";
import {
  documentPrimaryActionLabel,
  documentUsesDownloadDelivery,
  invoiceDocumentContextFromOrder,
  validateInvoiceDocumentModel,
} from "@/lib/invoice-document-policy";
import { issueAndDeliverOrderDocument } from "@/lib/order-document-flow";
import {
  lifecycleStageById,
  orderHasClosedFactura,
  orderHasProForma,
  parseLifecycleStageId,
  type FacturaLifecycleStageId,
} from "@/lib/facturas-lifecycle";
import { orderStatusLabel } from "@/lib/order-status";
import { formatMoney } from "@/lib/format-money";
import { ROUTES } from "@/lib/routes";

type Props = {
  initialStage?: FacturaLifecycleStageId;
};

export function FacturasModule({ initialStage = "pro-forma" }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const etapaParam = searchParams.get("etapa");

  const [activeStageId, setActiveStageId] = useState<FacturaLifecycleStageId>(
    () => parseLifecycleStageId(etapaParam ?? initialStage),
  );
  const stage = lifecycleStageById(activeStageId);

  const [orders, setOrders] = useState<AdminOrderListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActiveStageId(parseLifecycleStageId(etapaParam ?? initialStage));
  }, [etapaParam, initialStage]);

  const selectStage = useCallback(
    (id: FacturaLifecycleStageId) => {
      setActiveStageId(id);
      setSelectedId(null);
      setError(null);
      router.replace(`${ROUTES.admin.facturas.root}?etapa=${id}`, {
        scroll: false,
      });
    },
    [router],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminListOrders(200, 0, true);
      setOrders(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => o.status !== "CANCELLED")
      .filter((o) => {
        if (!q) return true;
        return (
          o.orderNumber.toLowerCase().includes(q) ||
          o.client.name.toLowerCase().includes(q)
        );
      });
  }, [orders, search, activeStageId]);

  const selected = useMemo(
    () => orders.find((o) => o.id === selectedId) ?? null,
    [orders, selectedId],
  );

  const validation = useMemo(() => {
    if (!selected) return null;
    return validateInvoiceDocumentModel(
      invoiceDocumentContextFromOrder(selected),
      stage.documentModel,
    );
  }, [selected, stage.documentModel]);

  const canIssue = validation?.ok ?? false;
  const usesDownload = documentUsesDownloadDelivery(stage.documentModel);
  const showConversion =
    activeStageId === "factura" && selected && orderHasProForma(selected);
  const showClosedFactura =
    activeStageId === "factura" && selected && orderHasClosedFactura(selected);

  async function handleIssue() {
    if (!selected || !canIssue) return;
    setIssuing(true);
    setError(null);
    try {
      const detail = await getOrder(selected.id);
      const sess = loadSession();
      await issueAndDeliverOrderDocument(detail, {
        documentModel: stage.documentModel,
        attendantLabel:
          sess?.user?.name?.trim() || sess?.user?.email?.trim() || undefined,
      });
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : usesDownload
            ? "Não foi possível descarregar o PDF."
            : "Não foi possível imprimir.",
      );
    } finally {
      setIssuing(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-400/75">
            Gestão simplificada
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Documentos de faturação
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Cada transição entre tipos de documento é rastreável. Escolha a
            etapa no fluxo e associe a um pedido — sem alterações ocultas.
          </p>
        </div>
        <Link
          href={ROUTES.admin.pedidoBalcao}
          className="text-xs font-semibold text-zinc-500 underline underline-offset-2 hover:text-amber-300"
        >
          Novo pedido no balcão (PDV) →
        </Link>
      </div>

      <FacturasLifecycleFlow
        activeStageId={activeStageId}
        onSelectStage={selectStage}
      />

      <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/40 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
              Operação · {stage.actionLabel}
            </p>
            <h3 className="text-base font-semibold text-zinc-100">
              {stage.title}
            </h3>
          </div>
          {activeStageId === "factura" && showConversion ? (
            <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-200">
              Conversão de pró-forma disponível
            </span>
          ) : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr,minmax(280px,360px)]">
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Associar pedido
            </label>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar n.º ou cliente…"
              className="mb-3 w-full rounded-xl border border-white/[0.08] bg-zinc-950/80 px-3 py-2.5 text-sm text-zinc-200 outline-none ring-amber-500/20 focus:border-amber-400/40 focus:ring-2"
            />
            {loading ? (
              <p className="py-6 text-center text-sm text-zinc-500">
                A carregar pedidos…
              </p>
            ) : visible.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-500">
                Nenhum pedido elegível nesta etapa.
              </p>
            ) : (
              <ul className="max-h-[min(420px,50vh)] space-y-1 overflow-y-auto rounded-xl border border-white/[0.05] bg-zinc-900/30 p-1">
                {visible.map((o) => {
                  const active = o.id === selectedId;
                  const hasPf = orderHasProForma(o);
                  const hasFt = orderHasClosedFactura(o);
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(o.id);
                          setError(null);
                        }}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                          active
                            ? "bg-amber-400/12 ring-1 ring-amber-400/30"
                            : "hover:bg-white/[0.04]"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block font-semibold text-zinc-100">
                            {o.orderNumber}
                          </span>
                          <span className="block truncate text-xs text-zinc-500">
                            {o.client.name}
                          </span>
                          {hasPf ? (
                            <span className="mt-0.5 block text-[10px] text-emerald-400/90">
                              Pró-forma: {o.lastDocumentNumber}
                            </span>
                          ) : null}
                          {hasFt ? (
                            <span className="mt-0.5 block text-[10px] text-sky-400/90">
                              Factura fechada: {o.lastDocumentNumber}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                          {orderStatusLabel(o.status)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-zinc-900/50 p-4">
            {!selected ? (
              <p className="text-sm leading-relaxed text-zinc-500">
                Seleccione um pedido para executar a etapa{" "}
                <span className="font-medium text-zinc-400">
                  {stage.shortTitle}
                </span>{" "}
                do ciclo.
              </p>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Transacção
                </p>
                <p className="mt-1 text-lg font-bold text-white">
                  {selected.orderNumber}
                </p>
                <p className="text-sm text-zinc-400">{selected.client.name}</p>
                <p className="mt-2 text-sm tabular-nums text-amber-200/90">
                  {formatMoney(selected.totalAmount, selected.currency)}
                </p>

                {showClosedFactura ? (
                  <p className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[11px] leading-relaxed text-sky-100">
                    Documento oficial já emitido e{" "}
                    <span className="font-semibold">fechado</span> (
                    {selected.lastDocumentNumber}). Só pode reemitir o PDF —
                    não alterar nem apagar.
                  </p>
                ) : null}

                {showConversion && !showClosedFactura ? (
                  <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] leading-relaxed text-emerald-100">
                    Pró-forma {selected.lastDocumentNumber} será convertida em
                    factura oficial. A proposta anterior mantém-se registada.
                  </p>
                ) : null}

                {stage.editable && activeStageId === "pro-forma" ? (
                  <p className="mt-4 rounded-lg border border-white/[0.08] bg-zinc-950/50 px-3 py-2 text-[11px] text-zinc-400">
                    Pode reemitir o PDF enquanto o pedido não tiver factura
                    fechada. Não movimenta stock.
                  </p>
                ) : null}

                {validation?.error ? (
                  <p
                    className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200"
                    role="alert"
                  >
                    {validation.error}
                  </p>
                ) : null}
                {!validation?.error && validation?.warning ? (
                  <p className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    {validation.warning}
                  </p>
                ) : null}

                <button
                  type="button"
                  disabled={issuing || !canIssue}
                  onClick={() => void handleIssue()}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/35 bg-amber-400/15 px-4 py-3 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/22 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {issuing ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-800/30 border-t-amber-200" />
                      A preparar…
                    </>
                  ) : showClosedFactura ? (
                    "Reemitir PDF (documento fechado)"
                  ) : activeStageId === "factura" && showConversion ? (
                    "Converter em factura oficial"
                  ) : (
                    documentPrimaryActionLabel(stage.documentModel)
                  )}
                </button>

                {activeStageId === "factura" && showConversion && canIssue ? (
                  <button
                    type="button"
                    disabled={issuing}
                    onClick={() => selectStage("recibo")}
                    className="mt-2 w-full text-center text-[11px] text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
                  >
                    Saltar para liquidação (recibo) →
                  </button>
                ) : null}

                {error ? (
                  <p className="mt-3 text-xs text-red-400" role="alert">
                    {error}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
