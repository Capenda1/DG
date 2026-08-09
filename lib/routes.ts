/**
 * Rotas da app — usar estes constantes em vez de strings soltas.
 */
export const ROUTES = {
  login: "/login",
  loginRecuperar: "/login/recuperar",
  loginVerificar: "/login/verificar",
  loginRedefinir: "/login/redefinir",
  home: "/",
  /** Área para utilizadores com perfil Cliente. */
  account: "/conta",
  accountPedidos: "/conta/pedidos",
  accountPedidoNovo: "/conta/pedidos/novo",
  admin: {
    root: "/admin",
    produtos: "/admin/produtos",
    clientes: "/admin/clientes",
    pedidos: "/admin/pedidos",
    /** PDV — criação manual de pedido (Admin + Atendente). */
    pedidoBalcao: "/admin/balcao",
    /** Área comercial — balcão e documentos. */
    vendas: {
      root: "/admin/vendas",
      pedidoBalcao: "/admin/balcao",
    },
    /** Emissão de documentos por tipo. */
    facturas: {
      root: "/admin/facturas",
      recibo: "/admin/facturas/recibo",
      factura: "/admin/facturas/factura",
      proForma: "/admin/facturas/pro-forma",
    },
    /** Stock de insumos — apenas ADMIN (UI e API). */
    insumos: "/admin/insumos",
    /** Razão, relatórios, export CSV (UI: só ADMIN). */
    financeiro: "/admin/financeiro",
    /** Turno de caixa PDV: abrir/fechar e histórico (ADMIN + ATENDENTE). */
    caixa: "/admin/caixa",
    /** Recursos Humanos: colaboradores, férias e ausências. */
    rh: "/admin/rh",
    /** Histórico SMS Twilio (pedido finalizado). */
    notificacoesSms: "/admin/notificacoes",
    relatorios: "/admin/relatorios",
    utilizadores: "/admin/utilizadores",
    configuracoes: "/admin/configuracoes",
    designer: "/admin/designer",
    modelos: "/admin/modelos",
    /** Galeria de fotos na área do cliente (ADMIN + DESIGNER). */
    galeria: "/admin/galeria",
    /** Ferramenta de restauro / melhoria de fotos raster (ADMIN e DESIGNER). */
    restaurarImagem: "/admin/ferramentas/restaurar-imagem",
  },
} as const;

/** Normaliza o papel vindo da API para comparação (enum Prisma em maiúsculas). */
export function normalizeUserRole(role: string | undefined | null): string {
  return String(role ?? "").trim().toUpperCase();
}

export function isStaffRole(role: string): boolean {
  const r = normalizeUserRole(role);
  return (
    r === "ADMIN" ||
    r === "DESIGNER" ||
    r === "ATTENDANT"
  );
}

/** Apenas Admin e Designer (ex.: guardar modelo global). */
export function staffCanAccessModelagemEditor(role: string): boolean {
  const r = normalizeUserRole(role);
  return r === "ADMIN" || r === "DESIGNER";
}

/** Na lista admin de pedidos: arte / editor só para admin e designer globalmente; atendente apenas nos que iniciou (`attendant`). */
export function staffMayViewOrderArtInPedidosPanel(
  role: string | undefined,
  sessionUserId: string | undefined,
  orderAttendantId: string | null,
): boolean {
  const r = normalizeUserRole(role);
  if (r === "ADMIN" || r === "DESIGNER") return true;
  if (r !== "ATTENDANT") return false;
  return Boolean(
    sessionUserId && orderAttendantId && orderAttendantId === sessionUserId,
  );
}

/**
 * Quem pode abrir `/conta/pedidos/:id/modelagem` sem ser redireccionado para /admin.
 * Inclui atendente para capturar modelagem em pedidos de balcão.
 */
export function canAccessPedidoModelagemRoute(role: string): boolean {
  const r = normalizeUserRole(role);
  return r === "ADMIN" || r === "DESIGNER" || r === "ATTENDANT";
}

/** Rotas /admin permitidas para perfil DESIGNER (resto redirecciona). */
export const DESIGNER_ADMIN_ALLOWED_HREFS = [
  ROUTES.admin.designer,
  /** Estados de produção (Aprovado · Em produção · Finalizado) — mesmas regras que `PATCH /orders/:id/status`. */
  ROUTES.admin.pedidos,
  ROUTES.admin.modelos,
  ROUTES.admin.galeria,
  ROUTES.admin.restaurarImagem,
] as const;

/** Atendente: PDV e pedidos (sem stock/insumos). */
export const ATTENDANT_ADMIN_ALLOWED_HREFS = [
  ROUTES.admin.pedidos,
  ROUTES.admin.pedidoBalcao,
  ROUTES.admin.vendas.root,
  ROUTES.admin.vendas.pedidoBalcao,
  ROUTES.admin.facturas.root,
  ROUTES.admin.facturas.recibo,
  ROUTES.admin.facturas.factura,
  ROUTES.admin.facturas.proForma,
  ROUTES.admin.caixa,
  ROUTES.admin.notificacoesSms,
  /** Compat.: antigo path; redirecciona para pedidoBalcao. */
  "/admin/pedidos/balcao",
] as const;

/** Barra final (ex.: `/admin/` → `/admin`) — evita regras de perfil falharem em ambientes/com proxy. */
export function normalizeAppPathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function pathnameAllowedForDesignerRole(pathname: string): boolean {
  const p = normalizeAppPathname(pathname);
  return DESIGNER_ADMIN_ALLOWED_HREFS.some(
    (href) => p === href || p.startsWith(`${href}/`),
  );
}

export function pathnameAllowedForAttendantRole(pathname: string): boolean {
  const p = normalizeAppPathname(pathname);
  return ATTENDANT_ADMIN_ALLOWED_HREFS.some(
    (href) => p === href || p.startsWith(`${href}/`),
  );
}

/** Página inicial da área admin para designers. */
export function adminHomePathForRole(role: string): string {
  const r = normalizeUserRole(role);
  if (r === "DESIGNER") {
    return ROUTES.admin.designer;
  }
  if (r === "ATTENDANT") {
    return ROUTES.admin.vendas.pedidoBalcao;
  }
  return ROUTES.admin.root;
}

/** Caminho do pedido na área conta. */
export function contaPedidoPath(orderId: string): string {
  return `/conta/pedidos/${orderId}`;
}

/** Área de modelagem / arte associada a um pedido. */
export function contaPedidoModelagemPath(orderId: string): string {
  return `/conta/pedidos/${orderId}/modelagem`;
}

/**
 * Após sair da ficha do pedido na área cliente (ou equivalente para staff).
 * Atendente ou administrador em pedido de balcão regressa ao PDV; designer à fila criativa.
 */
export function modelagemExitOverviewHref(
  role: string,
  orderId: string,
  opts?: { orderOrigin?: "ONLINE" | "BALCAO" },
): string {
  const r = normalizeUserRole(role);
  if (r === "DESIGNER") return ROUTES.admin.designer;
  if (r === "ATTENDANT" || r === "ADMIN") {
    return opts?.orderOrigin === "BALCAO"
      ? ROUTES.admin.pedidoBalcao
      : ROUTES.admin.pedidos;
  }
  if (isStaffRole(role)) return ROUTES.admin.pedidos;
  return contaPedidoPath(orderId);
}

/**
 * Listagem de pedidos (conta cliente) ou entrada admin compatível com o papel.
 */
export function accountPedidosIndexHref(role: string): string {
  const r = normalizeUserRole(role);
  if (r === "DESIGNER") return ROUTES.admin.designer;
  if (isStaffRole(role)) return ROUTES.admin.pedidos;
  return ROUTES.accountPedidos;
}

/** Destino após login consoante o perfil. */
export function postLoginPath(role: string): string {
  const r = normalizeUserRole(role);
  if (r === "DESIGNER") {
    return ROUTES.admin.designer;
  }
  if (r === "ATTENDANT") {
    return ROUTES.admin.vendas.pedidoBalcao;
  }
  if (r === "ADMIN") {
    return ROUTES.admin.root;
  }
  if (r === "CLIENT") {
    return ROUTES.account;
  }
  return ROUTES.login;
}

/**
 * Navegação completa (`window.location.replace`). Em `next dev`, `router.replace`
 * pode ficar preso («Failed to fetch RSC payload»); usar para `/login` e redirects críticos.
 * Não recarrega se o destino for o path actual (evita loops `/admin` ↔ `/login`↔`/admin`).
 */
export function hardNavigateReplace(href: string): void {
  if (typeof window === "undefined") return;
  try {
    const next = new URL(href, window.location.origin);
    if (
      next.pathname === window.location.pathname &&
      next.search === window.location.search
    ) {
      if (next.hash && next.hash !== window.location.hash) {
        window.location.hash = next.hash;
      }
      return;
    }
    window.location.replace(`${next.pathname}${next.search}${next.hash}`);
  } catch {
    window.location.replace(href);
  }
}
