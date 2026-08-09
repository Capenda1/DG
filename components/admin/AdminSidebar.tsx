"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { SessionUser } from "@/lib/auth-session";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  ROUTES,
  adminHomePathForRole,
  normalizeAppPathname,
  normalizeUserRole,
} from "@/lib/routes";
import {
  IconBox,
  IconCash,
  IconChart,
  IconDashboard,
  IconGallery,
  IconInvoice,
  IconImageEnhance,
  IconMessage,
  IconSettings,
  IconShirt,
  IconTemplate,
  IconTools,
  IconUserPlus,
  IconUsers,
} from "./admin-nav-icons";

type NavItem = {
  href?: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  end?: boolean;
  children?: { href: string; label: string }[];
};

const VENDAS_NAV_ITEM: NavItem = {
  label: "Vendas",
  icon: <IconInvoice className="shrink-0 opacity-90" />,
  children: [
    {
      href: ROUTES.admin.vendas.pedidoBalcao,
      label: "Pedidos Balcão",
    },
  ],
};

type NavGroup = { title: string; items: NavItem[] };

/** Menu ADMIN: relatórios e finanças junto ao núcleo de vendas / PDV na ordem dos grupos. */
const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    title: "Visão geral",
    items: [
      {
        href: ROUTES.admin.root,
        label: "Painel de Controlo",
        icon: <IconDashboard className="shrink-0 opacity-90" />,
        end: true,
      },
    ],
  },
  {
    title: "Catálogo & stock",
    items: [
      {
        href: ROUTES.admin.produtos,
        label: "Produtos & variantes",
        icon: <IconShirt className="shrink-0 opacity-90" />,
      },
      { href: ROUTES.admin.insumos, label: "Stock · insumos", icon: <IconBox className="shrink-0 opacity-90" /> },
    ],
  },
  {
    title: "Clientes & vendas",
    items: [
      { href: ROUTES.admin.clientes, label: "Gestão de Clientes", icon: <IconUsers className="shrink-0 opacity-90" /> },
      {
        href: ROUTES.admin.pedidos,
        label: "Pedidos & Faturamento",
        icon: <IconInvoice className="shrink-0 opacity-90" />,
      },
      {
        href: ROUTES.admin.notificacoesSms,
        label: "SMS · pedido finalizado",
        icon: <IconMessage className="shrink-0 opacity-90" />,
      },
      VENDAS_NAV_ITEM,
      { href: ROUTES.admin.caixa, label: "Caixa (PDV)", icon: <IconCash className="shrink-0 opacity-90" /> },
    ],
  },
  {
    title: "Relatórios & finanças",
    items: [
      { href: ROUTES.admin.relatorios, label: "Relatórios de Vendas", icon: <IconChart className="shrink-0 opacity-90" /> },
      { href: ROUTES.admin.financeiro, label: "Finanças", icon: <IconChart className="shrink-0 opacity-90" /> },
    ],
  },
  {
    title: "Administrativo",
    items: [
      { href: ROUTES.admin.utilizadores, label: "Utilizadores", icon: <IconUserPlus className="shrink-0 opacity-90" /> },
      { href: ROUTES.admin.rh, label: "RH (Recursos Humanos)", icon: <IconUsers className="shrink-0 opacity-90" /> },
      {
        href: ROUTES.admin.configuracoes,
        label: "Configurações Globais",
        icon: <IconSettings className="shrink-0 opacity-90" />,
      },
    ],
  },
  {
    title: "Produção & design",
    items: [
      {
        href: ROUTES.admin.designer,
        label: "Ferramentas de Designer",
        icon: <IconTools className="shrink-0 opacity-90" />,
      },
      { href: ROUTES.admin.modelos, label: "Modelos Prontos", icon: <IconTemplate className="shrink-0 opacity-90" /> },
      {
        href: ROUTES.admin.galeria,
        label: "Galeria · área cliente",
        icon: <IconGallery className="shrink-0 opacity-90" />,
      },
      {
        href: ROUTES.admin.restaurarImagem,
        label: "Restaurar imagem",
        icon: <IconImageEnhance className="shrink-0 opacity-90" />,
        end: true,
      },
    ],
  },
];

const NAV_DESIGNER_GROUPS: NavGroup[] = [
  {
    title: "Produção",
    items: [
      {
        href: ROUTES.admin.designer,
        label: "Ferramentas de Designer",
        icon: <IconTools className="shrink-0 opacity-90" />,
        end: true,
      },
    ],
  },
  {
    title: "Pedidos",
    items: [
      {
        href: ROUTES.admin.pedidos,
        label: "Pedidos · estados",
        icon: <IconInvoice className="shrink-0 opacity-90" />,
      },
    ],
  },
  {
    title: "Biblioteca & imagem",
    items: [
      {
        href: ROUTES.admin.modelos,
        label: "Modelos Prontos",
        icon: <IconTemplate className="shrink-0 opacity-90" />,
      },
      {
        href: ROUTES.admin.galeria,
        label: "Galeria · área cliente",
        icon: <IconGallery className="shrink-0 opacity-90" />,
        end: true,
      },
      {
        href: ROUTES.admin.restaurarImagem,
        label: "Restaurar imagem",
        icon: <IconImageEnhance className="shrink-0 opacity-90" />,
        end: true,
      },
    ],
  },
];

const NAV_ATTENDANT_GROUPS: NavGroup[] = [
  {
    title: "Área balcão",
    items: [
      VENDAS_NAV_ITEM,
      {
        href: ROUTES.admin.caixa,
        label: "Caixa",
        icon: <IconCash className="shrink-0 opacity-90" />,
      },
      {
        href: ROUTES.admin.pedidos,
        label: "Pedidos & Faturamento",
        icon: <IconInvoice className="shrink-0 opacity-90" />,
      },
      {
        href: ROUTES.admin.notificacoesSms,
        label: "SMS · pedido finalizado",
        icon: <IconMessage className="shrink-0 opacity-90" />,
      },
    ],
  },
];

function roleSubtitle(role: string): string {
  switch (normalizeUserRole(role)) {
    case "ADMIN":
      return "ADMINISTRADOR";
    case "DESIGNER":
      return "DESIGNER";
    case "ATTENDANT":
      return "ATENDENTE";
    case "CLIENT":
      return "CLIENTE";
    default:
      return role;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AdminSidebar({
  user,
  onLogout,
  isOpen,
  onClose,
  collapsed,
  onCollapsedChange,
}: {
  user: SessionUser;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const pathname = usePathname();

  const navGroups = useMemo(() => {
    const r = normalizeUserRole(user.role);
    if (r === "DESIGNER") return NAV_DESIGNER_GROUPS;
    if (r === "ATTENDANT") return NAV_ATTENDANT_GROUPS;
    return ADMIN_NAV_GROUPS;
  }, [user.role]);

  const brandHref = adminHomePathForRole(user.role);

  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fechar gaveta após navegação
  }, [pathname]);

  useEffect(() => {
    const p = normalizeAppPathname(pathname);
    if (
      p.startsWith(ROUTES.admin.vendas.root) ||
      p.startsWith(ROUTES.admin.vendas.pedidoBalcao)
    ) {
      setOpenSubmenus((prev) => ({ ...prev, Vendas: true }));
    }
  }, [pathname]);

  function isActive(item: NavItem): boolean {
    const p = normalizeAppPathname(pathname);
    if (item.children?.length) {
      return item.children.some(
        (child) => p === child.href || p.startsWith(`${child.href}/`),
      );
    }
    if (!item.href) return false;
    if (item.end) return p === item.href;
    return p === item.href || p.startsWith(`${item.href}/`);
  }

  function toggleSubmenu(label: string) {
    setOpenSubmenus((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <aside
      className={[
        "fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col overflow-hidden",
        "border-r border-zinc-200/90 bg-gradient-to-b from-white via-white to-zinc-50/95",
        "dark:border-white/[0.08] dark:from-zinc-950 dark:via-zinc-950 dark:to-black",
        "transition-[width,transform] duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full",
        "w-72 lg:static lg:translate-x-0",
        collapsed ? "lg:w-[4.5rem]" : "lg:w-72",
      ].join(" ")}
    >
      <div className="h-[3px] w-full shrink-0 bg-gradient-to-r from-amber-500 via-violet-500 to-sky-500 opacity-95 shadow-[0_2px_12px_-2px_rgba(245,158,11,0.35)]" />

      {/* Cabeçalho */}
      <div
        className={[
          "flex shrink-0 items-center justify-between px-5 pb-4 pt-5",
          collapsed ? "lg:flex-col lg:items-center lg:gap-3 lg:px-2" : "",
        ].join(" ")}
      >
        <Link
          href={brandHref}
          className={[
            "inline-flex items-center gap-2 rounded-xl outline-none ring-amber-400/40 focus-visible:ring-2",
            collapsed ? "justify-center lg:w-full" : "",
          ].join(" ")}
          title={collapsed ? "Ir ao painel inicial" : undefined}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 text-white shadow-md shadow-amber-600/35 ring-1 ring-black/15 dark:ring-white/25">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2l1.2 4.9L18 8l-4.8 1.1L12 14l-1.2-4.9L6 8l4.8-1.1L12 2z" />
            </svg>
          </span>
          <span
            className={[
              "truncate text-base font-bold tracking-tight text-zinc-900 dark:text-white",
              collapsed ? "lg:hidden" : "",
            ].join(" ")}
          >
            Dádiva <span className="text-amber-500 dark:text-amber-400">Gráfica</span>
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onCollapsedChange(!collapsed)}
            className="hidden rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-zinc-900 dark:hover:text-white lg:flex"
            aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            title={collapsed ? "Expandir menu" : "Recolher menu (mais espaço para conteúdo)"}
          >
            {collapsed ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5v14" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-zinc-900 dark:hover:text-white lg:hidden"
            aria-label="Fechar menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Perfil do utilizador */}
      <div
        className={[
          "mx-3 mb-5 flex shrink-0 items-center gap-3 rounded-xl border border-amber-200/65 bg-gradient-to-br from-amber-50 via-white to-violet-50/40 px-3 py-3 shadow-sm shadow-amber-500/10 ring-1 ring-amber-300/40 dark:border-amber-500/25 dark:from-amber-950/35 dark:via-zinc-900 dark:to-violet-950/25 dark:shadow-none dark:ring-amber-400/15",
          collapsed ? "mx-2 justify-center px-0 py-3 lg:flex-col lg:gap-1" : "",
        ].join(" ")}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-200/50 text-sm font-bold text-amber-900 ring-1 ring-amber-400/40 dark:bg-amber-400/20 dark:text-amber-300 dark:ring-amber-400/30"
          aria-hidden
        >
          {initials(user.name)}
        </div>
        <div className={`min-w-0 flex-1 ${collapsed ? "lg:sr-only" : ""}`}>
          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{user.name}</p>
          <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-amber-700/90 dark:text-amber-400/70">
            {roleSubtitle(user.role)}
          </p>
        </div>
      </div>

      {/* Navegação por grupos */}
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-4">
        {navGroups.map((group) => (
          <div key={group.title} className={group.title === navGroups[0]?.title ? "" : "mt-2 border-t border-zinc-200/70 pt-2 dark:border-white/[0.06]"}>
            <p
              className={`mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 ${
                collapsed ? "lg:sr-only" : ""
              }`}
            >
              {group.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(item);
                const hasChildren = Boolean(item.children?.length);
                const submenuOpen =
                  hasChildren && (openSubmenus[item.label] ?? active);

                if (hasChildren && item.children) {
                  const firstChild = item.children[0];
                  return (
                    <div key={item.label} className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (collapsed) return;
                          toggleSubmenu(item.label);
                        }}
                        title={collapsed ? item.label : undefined}
                        className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                          collapsed ? "lg:justify-center lg:gap-0 lg:px-2 lg:py-2.5" : ""
                        } ${
                          active
                            ? "bg-gradient-to-r from-amber-100 via-amber-50/95 to-transparent text-amber-950 ring-1 ring-amber-300/80 shadow-sm shadow-amber-600/10 dark:from-amber-500/14 dark:via-amber-400/8 dark:to-transparent dark:text-white dark:ring-amber-400/25"
                            : "text-zinc-600 hover:bg-gradient-to-r hover:from-zinc-100 hover:to-transparent hover:text-zinc-900 dark:text-zinc-400 dark:hover:from-white/[0.06] dark:hover:to-transparent dark:hover:text-zinc-200"
                        }`}
                      >
                        {collapsed ? (
                          <Link
                            href={firstChild.href}
                            className="absolute inset-0 rounded-xl"
                            aria-label={item.label}
                          />
                        ) : null}
                        <span
                          className={
                            active
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-zinc-500 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-300"
                          }
                        >
                          {item.icon}
                        </span>
                        <span
                          className={`${collapsed ? "flex-1 truncate lg:sr-only lg:flex-none" : "flex-1 truncate"}`}
                        >
                          {item.label}
                        </span>
                        {!collapsed ? (
                          <svg
                            className={`h-4 w-4 shrink-0 text-zinc-400 transition ${submenuOpen ? "rotate-180" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-hidden
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        ) : null}
                      </button>
                      {submenuOpen && !collapsed ? (
                        <div className="ml-9 flex flex-col gap-0.5 border-l border-zinc-200/80 pl-2 dark:border-white/[0.08]">
                          {item.children.map((child) => {
                            const childActive =
                              normalizeAppPathname(pathname) === child.href;
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                className={`rounded-lg px-2.5 py-2 text-[13px] font-medium transition ${
                                  childActive
                                    ? "bg-amber-400/12 text-amber-200"
                                    : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
                                }`}
                              >
                                {child.label}
                              </Link>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                if (!item.href) return null;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      collapsed ? "lg:justify-center lg:gap-0 lg:px-2 lg:py-2.5" : ""
                    } ${
                      active
                        ? "bg-gradient-to-r from-amber-100 via-amber-50/95 to-transparent text-amber-950 ring-1 ring-amber-300/80 shadow-sm shadow-amber-600/10 dark:from-amber-500/14 dark:via-amber-400/8 dark:to-transparent dark:text-white dark:ring-amber-400/25"
                        : "text-zinc-600 hover:bg-gradient-to-r hover:from-zinc-100 hover:to-transparent hover:text-zinc-900 dark:text-zinc-400 dark:hover:from-white/[0.06] dark:hover:to-transparent dark:hover:text-zinc-200"
                    }`}
                  >
                    {active && (
                      <span
                        className={`absolute left-0 top-1/2 hidden h-7 w-[3px] -translate-y-1/2 rounded-r bg-gradient-to-b from-amber-400 via-amber-500 to-orange-500 shadow-[2px_0_8px_-2px_rgba(245,158,11,0.65)] lg:block ${
                          collapsed ? "opacity-70" : ""
                        }`}
                        aria-hidden
                      />
                    )}
                    <span
                      className={
                        active
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-zinc-500 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-300"
                      }
                    >
                      {item.icon}
                    </span>
                    <span className={`${collapsed ? "flex-1 truncate lg:sr-only lg:flex-none" : "flex-1 truncate"}`}>
                      {item.label}
                    </span>
                    {item.badge != null ? (
                      <span
                        className={[
                          "flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-amber-200/80 px-1.5 text-xs font-bold text-amber-900 dark:bg-amber-400/20 dark:text-amber-400",
                          collapsed ? "lg:hidden" : "",
                        ].join(" ")}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Rodapé */}
      <div className={`shrink-0 border-t border-zinc-200 dark:border-white/[0.06] ${collapsed ? "p-2" : "p-3"}`}>
        <div className={`mb-2 px-1 ${collapsed ? "flex justify-center" : ""}`}>
          <ThemeToggle size={collapsed ? "sm" : "default"} className={collapsed ? "justify-center px-2" : "w-full justify-center"} />
        </div>
        <button
          type="button"
          onClick={onLogout}
          title={collapsed ? "Terminar sessão" : undefined}
          className={`flex items-center rounded-xl border border-transparent text-left text-sm text-zinc-600 transition hover:border-red-200/80 hover:bg-gradient-to-r hover:from-red-50 hover:to-white hover:text-red-700 dark:text-zinc-500 dark:hover:border-red-900/50 dark:hover:from-red-950/40 dark:hover:to-zinc-900 dark:hover:text-red-300 ${
            collapsed ? "w-full justify-center px-2 py-2 lg:justify-center" : "w-full gap-2 px-3 py-2"
          }`}
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M10 2H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4M11 5l3 3-3 3M7 8h7" />
          </svg>
          <span className={collapsed ? "lg:sr-only" : ""}>Terminar sessão</span>
        </button>
      </div>
    </aside>
  );
}
