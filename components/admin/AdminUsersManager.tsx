"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  checkAdminUserEmailAvailability,
  createUserAsAdmin,
  deleteUserAsAdmin,
  fetchMe,
  listUsersAsAdmin,
  resetUserPasswordAsAdmin,
  updateUserAsAdmin,
  upsertRhProfile,
  type AdminUserListItem,
  type UserRole,
} from "@/lib/api-client";
import { loadSession, saveSession, type SessionUser } from "@/lib/auth-session";
import { ROUTES } from "@/lib/routes";
import { normalizeEmail } from "@/lib/email";
import {
  angolaPhoneApiDigits,
  angolaPhoneNormalizedStored,
  displayPhoneAsMask,
  formatWhatsAppMaskInput,
  isAngolaPhoneComplete,
} from "@/lib/whatsapp-mask";
import { useAnimatedConfirm } from "@/components/providers/AnimatedConfirmProvider";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "CLIENT", label: "Cliente" },
  { value: "DESIGNER", label: "Designer" },
  { value: "ATTENDANT", label: "Atendente" },
  { value: "ADMIN", label: "Administrador" },
  { value: "COLLABORATOR", label: "Colaborador (sem acesso)" },
];

/** Perfis da equipa (aba Utilizadores — sem clientes). */
const ROLES_TEAM: { value: UserRole; label: string }[] = [
  { value: "DESIGNER", label: "Designer" },
  { value: "ATTENDANT", label: "Atendente" },
  { value: "ADMIN", label: "Administrador" },
  { value: "COLLABORATOR", label: "Colaborador (sem acesso)" },
];

const COLLABORATOR_FUNCTIONS = [
  {
    value: "seguranca",
    label: "Segurança",
    cargo: "Segurança",
    departamento: "Segurança",
  },
  {
    value: "faccionista",
    label: "Faccionista",
    cargo: "Faccionista",
    departamento: "Produção",
  },
  {
    value: "outro",
    label: "Outro (definir no RH)",
    cargo: "",
    departamento: "",
  },
] as const;

type CollaboratorFunctionId = (typeof COLLABORATOR_FUNCTIONS)[number]["value"];

function isCollaboratorRole(role: string): boolean {
  return role === "COLLABORATOR";
}

function displayUserEmail(user: { email: string; role: string }): string {
  if (isCollaboratorRole(user.role) && user.email.endsWith("@interno.local")) {
    return "— (sem login)";
  }
  return user.email;
}

const PHONE_HINT =
  "Angola: +244 e 9 dígitos do telemóvel (ex.: +244 923 456 789).";
const PHONE_INCOMPLETE_MSG =
  "Telefone: indique os 9 dígitos do número angolano (além do código +244), ou deixe vazio.";

const labelUi =
  "text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500";

const inputClass =
  "w-full rounded-xl border border-zinc-600/40 bg-zinc-900/70 px-4 py-3 text-[15px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition placeholder:text-zinc-600 focus:border-amber-500/55 focus:ring-2 focus:ring-amber-500/20";

const btnGhost =
  "rounded-xl border border-zinc-600/50 bg-zinc-800/40 px-4 py-2.5 text-sm font-medium text-zinc-200 shadow-sm transition hover:border-zinc-500 hover:bg-zinc-800/70";

const btnPrimary =
  "rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-500/15 transition hover:from-amber-300 hover:to-amber-400 disabled:opacity-50";

const btnPrimaryCompact =
  "rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 px-3 py-2 text-xs font-semibold text-zinc-950 shadow-md shadow-amber-500/10 transition hover:from-amber-300 hover:to-amber-400 disabled:opacity-50";

function roleLabel(role: string): string {
  return ROLES.find((r) => r.value === role)?.label ?? role;
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    CLIENT: "bg-zinc-500/20 text-zinc-200 ring-zinc-400/20",
    DESIGNER: "bg-violet-500/20 text-violet-200 ring-violet-400/25",
    ATTENDANT: "bg-teal-500/20 text-teal-100 ring-teal-400/25",
    ADMIN: "bg-amber-500/20 text-amber-100 ring-amber-400/30",
    COLLABORATOR: "bg-sky-500/15 text-sky-200 ring-sky-400/25",
  };
  const cls = styles[role] ?? "bg-zinc-500/20 text-zinc-200";
  return (
    <span
      className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {roleLabel(role)}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-PT", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

function IconSpark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 2l1.2 4.9L18 8l-4.8 1.1L12 14l-1.2-4.9L6 8l4.8-1.1L12 2zM19 13l.6 2.4 2.4.6-2.4.6-.6 2.4-.6-2.4-2.4-.6 2.4-.6.6-2.4zM5 15l.8 3.2 3.2.8-3.2.8-.8 3.2-.8-3.2-3.2-.8 3.2-.8.8-3.2z" />
    </svg>
  );
}

function IconUserPlus({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" strokeLinecap="round" />
    </svg>
  );
}

function ModalBackdrop({
  title,
  children,
  onClose,
  size = "md",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: "md" | "lg";
}) {
  const maxW = size === "lg" ? "max-w-lg" : "max-w-md";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Fechar"
        className="fixed inset-0 bg-zinc-950/75 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-labelledby="modal-title"
        className={`relative my-2 flex max-h-[min(92vh,760px)] w-full ${maxW} flex-col overflow-hidden rounded-2xl border border-zinc-700/60 bg-zinc-900 shadow-2xl shadow-black/40 sm:my-0`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 w-full shrink-0 bg-gradient-to-r from-amber-400 via-cyan-400 to-amber-500" />
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-800/80 px-6 py-4 sm:px-8 sm:py-5">
          <h2
            id="modal-title"
            className="text-lg font-semibold leading-snug tracking-tight text-white"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Fechar diálogo"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8 sm:py-6">
          {children}
        </div>
      </div>
    </div>
  );
}

export type AdminUsersManagerVariant = "utilizadores" | "clientes";

export function AdminUsersManager({
  variant,
}: {
  variant: AdminUsersManagerVariant;
}) {
  const searchParams = useSearchParams();
  const confirmAction = useAnimatedConfirm();
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const listRole = useMemo((): UserRole | undefined => {
    if (variant === "clientes") {
      return "CLIENT";
    }
    const r = searchParams.get("role");
    if (r === "DESIGNER" || r === "ATTENDANT" || r === "ADMIN" || r === "COLLABORATOR") {
      return r;
    }
    return undefined;
  }, [searchParams, variant]);

  const [me, setMe] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<UserRole>(() =>
    variant === "clientes" ? "CLIENT" : "DESIGNER",
  );
  const [createCollaboratorFunction, setCreateCollaboratorFunction] =
    useState<CollaboratorFunctionId>("seguranca");
  const [createPhone, setCreatePhone] = useState("");
  const [createIsCompany, setCreateIsCompany] = useState(false);
  const [createNif, setCreateNif] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createSuccessBanner, setCreateSuccessBanner] = useState<
    string | null
  >(null);

  const [editUser, setEditUser] = useState<AdminUserListItem | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editIsCompany, setEditIsCompany] = useState(false);
  const [editNif, setEditNif] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("DESIGNER");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [pwdUser, setPwdUser] = useState<AdminUserListItem | null>(null);
  const [pwdNew, setPwdNew] = useState("");
  const [pwdNew2, setPwdNew2] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  const [delUser, setDelUser] = useState<AdminUserListItem | null>(null);
  const [delLoading, setDelLoading] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  useEffect(() => {
    setMe(loadSession()?.user ?? null);
  }, []);

  useEffect(() => {
    if (variant === "clientes") {
      setCreateRole("CLIENT");
      return;
    }
    const r = searchParams.get("role");
    if (r === "DESIGNER" || r === "ATTENDANT" || r === "ADMIN" || r === "COLLABORATOR") {
      setCreateRole(r);
    }
  }, [searchParams, variant]);

  useEffect(() => {
    if (editUser) {
      setEditEmail(editUser.email);
      setEditName(editUser.name);
      setEditPhone(displayPhoneAsMask(editUser.phone));
      setEditIsCompany(editUser.clientType === "COMPANY");
      setEditNif(editUser.nif ?? "");
      setEditRole(editUser.role as UserRole);
      setEditError(null);
    }
  }, [editUser]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const reloadUsers = useCallback(async () => {
    setListError(null);
    setListLoading(true);
    try {
      const rows = await listUsersAsAdmin({
        q: debouncedSearch.trim() || undefined,
        role: listRole,
        excludeRole: variant === "utilizadores" ? "CLIENT" : undefined,
        includeOrderCount: variant === "clientes",
      });
      setUsers(rows);
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : "Não foi possível carregar a lista.",
      );
      setUsers([]);
    } finally {
      setListLoading(false);
    }
  }, [debouncedSearch, listRole, variant]);

  useEffect(() => {
    void reloadUsers();
  }, [reloadUsers]);

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);
    try {
      const role = variant === "clientes" ? "CLIENT" : createRole;
      const p = createPhone.trim();
      if (role === "CLIENT" && !p) {
        setCreateError("Indique o número de telefone do cliente.");
        setCreateLoading(false);
        return;
      }
      if (role === "CLIENT" && createIsCompany && !createNif.trim()) {
        setCreateError("Indique o NIF da empresa.");
        setCreateLoading(false);
        return;
      }
      if (p && !isAngolaPhoneComplete(p)) {
        setCreateError(PHONE_INCOMPLETE_MSG);
        setCreateLoading(false);
        return;
      }

      const isCollaborator = isCollaboratorRole(role);

      if (!isCollaborator && role !== "CLIENT") {
        const normalizedEmail = normalizeEmail(createEmail);
        if (!normalizedEmail) {
          setCreateError("Indique o email.");
          setCreateLoading(false);
          return;
        }
        const emailCheck = await checkAdminUserEmailAvailability(normalizedEmail);
        if (!emailCheck.available) {
          setCreateError(
            emailCheck.message ?? "Este Email já está registado.",
          );
          setCreateLoading(false);
          return;
        }
        if (createPassword.length < 8) {
          setCreateError("A palavra-passe deve ter pelo menos 8 caracteres.");
          setCreateLoading(false);
          return;
        }
      }

      const result = await createUserAsAdmin({
        email:
          isCollaborator || role === "CLIENT"
            ? undefined
            : normalizeEmail(createEmail),
        name: createName.trim(),
        password: isCollaborator ? undefined : createPassword,
        role,
        phone: p ? angolaPhoneApiDigits(p) : undefined,
        ...(role === "CLIENT"
          ? {
              isCompany: createIsCompany,
              ...(createIsCompany ? { nif: createNif.trim() } : {}),
            }
          : {}),
      });

      if (isCollaborator) {
        const fn = COLLABORATOR_FUNCTIONS.find(
          (item) => item.value === createCollaboratorFunction,
        );
        if (fn && fn.value !== "outro") {
          await upsertRhProfile(result.user.id, {
            cargo: fn.cargo,
            departamento: fn.departamento,
            estadoContrato: "Ativo",
          });
        }
        setCreateSuccessBanner(
          `Colaborador registado: ${result.user.name} (${roleLabel(result.user.role)}). Aparece no RH — sem acesso ao sistema.`,
        );
      } else if (role === "CLIENT") {
        setCreateSuccessBanner(
          `Cliente criado: ${result.user.name}${result.user.phone ? ` · ${result.user.phone}` : ""}.`,
        );
      } else {
        setCreateSuccessBanner(
          `Conta criada: ${result.user.email} (${roleLabel(result.user.role)}). Envie a palavra-passe por um canal seguro.`,
        );
      }

      setCreateEmail("");
      setCreateName("");
      setCreatePassword("");
      setCreatePhone("");
      setCreateIsCompany(false);
      setCreateNif("");
      setCreateCollaboratorFunction("seguranca");
      setCreateRole(
        variant === "clientes" ? "CLIENT" : (listRole ?? "DESIGNER"),
      );
      setCreateModalOpen(false);
      await reloadUsers();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Erro ao criar utilizador.",
      );
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setEditError(null);
    setEditLoading(true);
    try {
      const body: Parameters<typeof updateUserAsAdmin>[1] = {};
      if (variant !== "clientes" && editEmail.trim() !== editUser.email) {
        const normalizedEmail = normalizeEmail(editEmail);
        const emailCheck = await checkAdminUserEmailAvailability(
          normalizedEmail,
          editUser.id,
        );
        if (!emailCheck.available) {
          setEditError(
            emailCheck.message ?? "Este Email já está registado.",
          );
          setEditLoading(false);
          return;
        }
        body.email = normalizedEmail;
      }
      if (editName.trim() !== editUser.name) {
        body.name = editName.trim();
      }
      const p = editPhone.trim();
      if (editUser.role === "CLIENT" && !p) {
        setEditError("O telefone é obrigatório para o login do cliente.");
        setEditLoading(false);
        return;
      }
      if (editUser.role === "CLIENT" && editIsCompany && !editNif.trim()) {
        setEditError("O NIF é obrigatório para contas de empresa.");
        setEditLoading(false);
        return;
      }
      if (p && !isAngolaPhoneComplete(p)) {
        setEditError(PHONE_INCOMPLETE_MSG);
        setEditLoading(false);
        return;
      }
      const nextPhoneDigits = p ? angolaPhoneApiDigits(p) : "";
      const prevPhoneDigits = angolaPhoneNormalizedStored(editUser.phone);
      if (nextPhoneDigits !== prevPhoneDigits) {
        body.phone = nextPhoneDigits;
      }
      if (editUser.role === "CLIENT") {
        const wasCompany = editUser.clientType === "COMPANY";
        if (editIsCompany !== wasCompany) {
          body.isCompany = editIsCompany;
        }
        if (editIsCompany) {
          const nextNif = editNif.trim();
          if (nextNif !== (editUser.nif ?? "").trim() || !wasCompany) {
            body.isCompany = true;
            body.nif = nextNif;
          }
        } else if (wasCompany) {
          body.isCompany = false;
        }
      }
      if (variant !== "clientes" && editRole !== editUser.role) {
        body.role = editRole;
      }
      if (Object.keys(body).length === 0) {
        setEditError("Nada alterado.");
        setEditLoading(false);
        return;
      }
      await updateUserAsAdmin(editUser.id, body);
      setEditUser(null);
      await reloadUsers();
      const s = loadSession();
      if (s?.user.id === editUser.id) {
        const meFresh = await fetchMe();
        saveSession({ ...s, user: meFresh });
        setMe(meFresh);
      }
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Erro ao atualizar.",
      );
    } finally {
      setEditLoading(false);
    }
  }

  async function handlePwdSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pwdUser) return;
    setPwdError(null);
    if (pwdNew.length < 8) {
      setPwdError("A nova palavra-passe deve ter pelo menos 8 caracteres.");
      return;
    }
    if (pwdNew !== pwdNew2) {
      setPwdError("As palavras-passe não coincidem.");
      return;
    }
    setPwdLoading(true);
    try {
      await resetUserPasswordAsAdmin(pwdUser.id, pwdNew);
      setPwdUser(null);
      setPwdNew("");
      setPwdNew2("");
    } catch (err) {
      setPwdError(
        err instanceof Error ? err.message : "Erro ao redefinir palavra-passe.",
      );
    } finally {
      setPwdLoading(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!delUser) return;
    setDelError(null);
    setDelLoading(true);
    try {
      await deleteUserAsAdmin(delUser.id);
      setDelUser(null);
      await reloadUsers();
    } catch (err) {
      setDelError(err instanceof Error ? err.message : "Erro ao eliminar.");
    } finally {
      setDelLoading(false);
    }
  }

  async function handleToggleClientActive(user: AdminUserListItem) {
    if (user.role !== "CLIENT") return;
    const nextActive = user.active === false;
    const ok = await confirmAction({
      title: nextActive ? "Activar cliente" : "Desactivar cliente",
      message: nextActive
        ? `Activar «${user.name}»? O cliente volta a poder iniciar sessão.`
        : `Desactivar «${user.name}»? O cliente deixa de poder iniciar sessão e as sessões activas são terminadas.`,
      confirmLabel: nextActive ? "Activar" : "Desactivar",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    setStatusBusyId(user.id);
    setListError(null);
    try {
      await updateUserAsAdmin(user.id, { active: nextActive });
      await reloadUsers();
    } catch (err) {
      setListError(
        err instanceof Error
          ? err.message
          : "Não foi possível actualizar o estado do cliente.",
      );
    } finally {
      setStatusBusyId(null);
    }
  }

  const isClientView = variant === "clientes";

  const totalPedidos =
    variant === "clientes"
      ? users.reduce((acc, u) => acc + (u.orderCount ?? 0), 0)
      : 0;

  return (
    <div className="relative min-h-full">
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-amber-500/[0.12] blur-3xl" />
        <div className="absolute right-0 top-1/3 h-72 w-72 -translate-y-1/2 rounded-full bg-cyan-500/[0.08] blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-violet-500/[0.06] blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1380px] px-5 py-10 sm:px-8 sm:py-12 md:px-10 md:py-14">
        {createSuccessBanner ? (
          <div
            className="mb-8 flex items-start gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/[0.12] px-4 py-3 shadow-lg shadow-teal-900/10 sm:items-center sm:px-5 sm:py-4"
            role="status"
          >
            <IconSpark className="mt-0.5 h-5 w-5 shrink-0 text-amber-300 sm:mt-0" />
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-zinc-50">
              {createSuccessBanner}
            </p>
            <button
              type="button"
              onClick={() => setCreateSuccessBanner(null)}
              className="shrink-0 rounded-lg px-2 py-1 text-sm text-amber-200/80 hover:bg-amber-500/20 hover:text-amber-100"
              aria-label="Fechar aviso"
            >
              ×
            </button>
          </div>
        ) : null}

        <header className="mb-6 md:mb-8">
          <div className="rounded-xl border border-zinc-700/50 bg-zinc-950/40 p-3 shadow-lg shadow-black/15 backdrop-blur-sm sm:p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300/95">
                  <IconSpark className="h-3 w-3 text-amber-400" />
                  {variant === "clientes" ? "Clientes" : "Administração"}
                </span>
                <h1 className="min-w-0 text-base font-semibold tracking-tight text-white sm:text-lg">
                  {variant === "clientes" ? (
                    <>
                      Gestão{" "}
                      <span className="bg-gradient-to-r from-amber-200 to-cyan-300 bg-clip-text text-transparent">
                        de clientes
                      </span>
                    </>
                  ) : (
                    <>
                      Utilizadores{" "}
                      <span className="bg-gradient-to-r from-amber-200 to-cyan-300 bg-clip-text text-transparent">
                        da equipa
                      </span>
                    </>
                  )}
                </h1>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-zinc-800/70 pt-3 md:border-0 md:pt-0">
                <div className="mr-auto flex min-w-0 items-center gap-2 md:mr-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400/30 to-cyan-500/10 ring-1 ring-amber-400/20">
                    <IconUserPlus className="h-4 w-4 text-amber-100" />
                  </div>
                  <div className="min-w-0 leading-tight">
                    <p className="text-xs font-semibold text-white">
                      {variant === "clientes" ? "Novo cliente" : "Novo utilizador"}
                    </p>
                    {variant === "clientes" ? (
                      <p className="text-[10px] text-zinc-500">
                        Perfil{" "}
                        <span className="text-amber-400/90">Cliente</span>
                      </p>
                    ) : listRole ? (
                      <p className="text-[10px] text-zinc-500">
                        Perfil:{" "}
                        <span className="text-amber-400/90">
                          {roleLabel(listRole)}
                        </span>
                      </p>
                    ) : (
                      <p className="text-[10px] text-zinc-600">
                        Registar conta
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCreateError(null);
                    setCreateModalOpen(true);
                  }}
                  className={`${btnPrimaryCompact} inline-flex items-center justify-center gap-1.5 whitespace-nowrap`}
                >
                  <IconUserPlus className="h-3.5 w-3.5 shrink-0 opacity-95" />
                  Registar
                </button>
              </div>
            </div>
            <p className="mt-3 border-t border-zinc-800/60 pt-3 text-xs leading-relaxed text-zinc-500 sm:text-[13px] sm:text-zinc-400">
              {variant === "clientes" ? (
                "Toda a gestão de contas cliente nesta página: criar, editar, redefinir palavra-passe e eliminar quando não houver histórico associado."
              ) : (
                <>
                  Administradores, designers e produção: criar, editar,
                  redefinir palavra-passe ou eliminar quando não houver histórico
                  associado. Clientes em{" "}
                  <Link
                    href={ROUTES.admin.clientes}
                    className="text-amber-500/90 hover:text-amber-400"
                  >
                    Gestão de clientes
                  </Link>
                  .
                </>
              )}
            </p>
          </div>
        </header>

        {variant === "clientes" ? (
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Clientes
              </p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {listLoading ? "—" : users.length}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Pedidos (total)
              </p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {listLoading ? "—" : totalPedidos}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Média / cliente
              </p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {listLoading || users.length === 0
                  ? "—"
                  : (totalPedidos / users.length).toLocaleString("pt-PT", {
                      maximumFractionDigits: 1,
                    })}
              </p>
            </div>
          </div>
        ) : null}

        <div className="min-w-0">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-zinc-700/50 bg-zinc-950/35 shadow-xl shadow-black/25 backdrop-blur-sm">
            <div className="flex flex-col gap-5 border-b border-zinc-800/80 p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6 md:p-8">
              <div className="relative min-w-0 flex-1">
                <label
                  htmlFor={variant === "clientes" ? "client-search" : "user-search"}
                  className={`mb-2 block ${labelUi}`}
                >
                  Pesquisar
                </label>
                <div className="relative">
                  <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
                  <input
                    id={variant === "clientes" ? "client-search" : "user-search"}
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={
                      variant === "clientes"
                        ? "Nome, telefone ou NIF…"
                        : "Nome ou email…"
                    }
                    className={`${inputClass} pl-12`}
                  />
                </div>
              </div>
              <div className="flex shrink-0 items-end sm:pb-0">
                <button
                  type="button"
                  onClick={() => void reloadUsers()}
                  className={btnGhost}
                >
                  Atualizar lista
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              {listError ? (
                <p className="p-8 text-sm leading-relaxed text-red-300 md:p-10">
                  {listError}
                </p>
              ) : listLoading ? (
                <div className="space-y-3 p-6 md:p-8">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className="h-14 animate-pulse rounded-xl bg-zinc-800/50"
                    />
                  ))}
                </div>
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-16 text-center md:py-20">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-700/60 bg-zinc-900/50">
                    <IconSearch className="h-8 w-8 text-zinc-600" />
                  </div>
                  <p className="max-w-sm text-sm leading-relaxed text-zinc-500">
                    {debouncedSearch.trim()
                      ? "Nenhum resultado para esta pesquisa. Tente outros termos."
                                           : variant === "clientes"
                        ? "Ainda não existem clientes registados."
                        : "Ainda não existem membros da equipa registados."}
                  </p>
                </div>
              ) : (
                               <table
                  className={`w-full text-left text-sm ${variant === "clientes" ? "min-w-[52rem]" : "min-w-[58rem]"}`}
                >
                  <thead>
                    <tr className="border-b border-zinc-800/90 bg-zinc-900/50 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      <th className="px-5 py-4 font-medium md:px-6">Nome</th>
                      {variant !== "clientes" ? (
                        <th className="px-5 py-4 font-medium md:px-6">Email</th>
                      ) : null}
                      {variant !== "clientes" ? (
                        <th className="px-5 py-4 font-medium md:px-6">
                          Perfil
                        </th>
                      ) : null}
                      {isClientView ? (
                        <th className="px-5 py-4 font-medium md:px-6">
                          Tipo
                        </th>
                      ) : null}
                      {isClientView ? (
                        <th className="px-5 py-4 font-medium md:px-6">
                          Estado
                        </th>
                      ) : null}
                      {isClientView ? (
                        <th className="px-5 py-4 text-right font-medium tabular-nums md:px-6">
                          Pedidos
                        </th>
                      ) : null}
                      <th className="hidden px-5 py-4 font-medium md:table-cell md:px-6">
                        Telefone
                      </th>
                      <th className="hidden px-5 py-4 font-medium lg:table-cell lg:px-6">
                        Registo
                      </th>
                      <th className="px-5 py-4 text-right font-medium md:px-6">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {users.map((u) => {
                      const isSelf = me?.id === u.id;
                      return (
                        <tr
                          key={u.id}
                          className={`transition-colors ${
                            isSelf
                              ? "bg-amber-500/[0.07] hover:bg-amber-500/10"
                              : "hover:bg-zinc-900/40"
                          }`}
                        >
                          <td className="px-5 py-4 md:px-6">
                            <span className="font-medium text-white">
                              {u.name}
                            </span>
                            {isSelf ? (
                              <span className="ml-2 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                                Tu
                              </span>
                            ) : null}
                          </td>
                          {variant !== "clientes" ? (
                            <td className="px-5 py-4 text-zinc-300 md:px-6">
                              {displayUserEmail(u)}
                            </td>
                          ) : null}
                          {variant !== "clientes" ? (
                            <td className="px-5 py-4 md:px-6">
                              <RoleBadge role={u.role} />
                            </td>
                          ) : null}
                          {isClientView ? (
                            <td className="px-5 py-4 text-zinc-300 md:px-6">
                              {u.clientType === "COMPANY" ? (
                                <span className="block">
                                  <span className="font-medium text-amber-200">
                                    Jurídica
                                  </span>
                                  {u.nif ? (
                                    <span className="mt-0.5 block text-[11px] text-zinc-500">
                                      NIF {u.nif}
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                "Física"
                              )}
                            </td>
                          ) : null}
                          {isClientView ? (
                            <td className="px-5 py-4 md:px-6">
                              {u.active === false ? (
                                <span className="inline-flex rounded-md bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-300 ring-1 ring-red-400/20">
                                  Inactivo
                                </span>
                              ) : (
                                <span className="inline-flex rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-400/20">
                                  Activo
                                </span>
                              )}
                            </td>
                          ) : null}
                          {isClientView ? (
                            <td className="px-5 py-4 text-right tabular-nums text-zinc-200 md:px-6">
                              {u.orderCount ?? 0}
                            </td>
                          ) : null}
                          <td className="hidden px-5 py-4 text-zinc-400 md:table-cell md:px-6">
                            {u.phone ?? "—"}
                          </td>
                          <td className="hidden px-5 py-4 text-zinc-500 lg:table-cell lg:px-6">
                            {formatDate(u.createdAt)}
                          </td>
                          <td className="px-5 py-4 md:px-6">
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditUser(u)}
                                className="rounded-lg border border-zinc-600/50 bg-zinc-800/50 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-amber-500/30 hover:bg-zinc-800"
                              >
                                Editar
                              </button>
                              {isClientView ? (
                                <button
                                  type="button"
                                  disabled={statusBusyId === u.id}
                                  onClick={() => void handleToggleClientActive(u)}
                                  className={
                                    u.active === false
                                      ? "rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50"
                                      : "rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
                                  }
                                >
                                  {statusBusyId === u.id
                                    ? "A actualizar…"
                                    : u.active === false
                                      ? "Activar"
                                      : "Desactivar"}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => {
                                  setPwdUser(u);
                                  setPwdNew("");
                                  setPwdNew2("");
                                  setPwdError(null);
                                }}
                                disabled={isCollaboratorRole(u.role)}
                                title={
                                  isCollaboratorRole(u.role)
                                    ? "Colaboradores sem acesso não utilizam palavra-passe"
                                    : undefined
                                }
                                className="rounded-lg border border-zinc-600/50 bg-zinc-800/50 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-amber-500/30 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Palavra-passe
                              </button>
                              <button
                                type="button"
                                disabled={isSelf}
                                title={
                                  isSelf
                                    ? "Não pode eliminar a própria conta"
                                    : undefined
                                }
                                onClick={() => {
                                  setDelUser(u);
                                  setDelError(null);
                                }}
                                className="rounded-lg border border-red-500/35 bg-red-500/[0.08] px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {!listLoading && !listError ? (
              <div className="border-t border-zinc-800/80 px-6 py-4 md:px-8">
                <p className="text-xs leading-relaxed text-zinc-500">
                  <span className="font-medium text-zinc-400">
                    {users.length}
                  </span>{" "}
                  {variant === "clientes"
                    ? `cliente${users.length === 1 ? "" : "s"}`
                    : `utilizador${users.length === 1 ? "" : "es"}`}
                  {debouncedSearch.trim() ? " · filtrado pela pesquisa" : ""}
                  {variant !== "clientes" && listRole
                    ? ` · perfil ${roleLabel(listRole)}`
                    : ""}
                  {variant === "clientes" ? (
                    <>
                      {" · "}
                      <Link
                        href={ROUTES.admin.pedidos}
                        className="text-amber-500/90 hover:text-amber-400"
                      >
                        Pedidos e faturação
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {createModalOpen ? (
        <ModalBackdrop
          title={
            variant === "clientes"
              ? "Registar novo cliente"
              : "Registar novo utilizador"
          }
          size="lg"
          onClose={() => !createLoading && setCreateModalOpen(false)}
        >
          <form
            onSubmit={handleCreateUser}
            className="flex flex-col gap-5"
          >
            <div>
              <label
                htmlFor="create-name"
                className={`mb-2 block ${labelUi}`}
              >
                {variant === "clientes" && createIsCompany
                  ? "Nome da empresa"
                  : "Nome"}
              </label>
              <input
                id="create-name"
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                required
                minLength={2}
                className={inputClass}
              />
            </div>
            {variant === "clientes" ? (
              <>
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-zinc-700/70 bg-zinc-900/50 px-4 py-3.5">
                  <span>
                    <span className="block text-sm font-semibold text-zinc-100">
                      Conta de empresa
                    </span>
                    <span className="mt-0.5 block text-[11px] text-zinc-500">
                      Activa para cadastrar uma pessoa jurídica.
                    </span>
                  </span>
                  <span className="relative inline-flex shrink-0">
                    <input
                      type="checkbox"
                      checked={createIsCompany}
                      onChange={(e) => {
                        setCreateIsCompany(e.target.checked);
                        if (!e.target.checked) setCreateNif("");
                      }}
                      disabled={createLoading}
                      className="peer sr-only"
                    />
                    <span className="h-6 w-11 rounded-full bg-zinc-700 transition peer-checked:bg-amber-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber-500" />
                    <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
                  </span>
                </label>
                {createIsCompany ? (
                  <div>
                    <label
                      htmlFor="create-nif"
                      className={`mb-2 block ${labelUi}`}
                    >
                      NIF da empresa
                    </label>
                    <input
                      id="create-nif"
                      type="text"
                      inputMode="numeric"
                      value={createNif}
                      onChange={(e) => setCreateNif(e.target.value)}
                      required
                      maxLength={32}
                      className={inputClass}
                      placeholder="Número de identificação fiscal"
                    />
                  </div>
                ) : null}
              </>
            ) : null}
            {variant !== "clientes" ? (
              <div>
                <label
                  htmlFor="create-role"
                  className={`mb-2 block ${labelUi}`}
                >
                  Perfil
                </label>
                <select
                  id="create-role"
                  value={createRole}
                  onChange={(e) =>
                    setCreateRole(e.target.value as UserRole)
                  }
                  className={inputClass}
                >
                  {ROLES_TEAM.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {variant !== "clientes" && isCollaboratorRole(createRole) ? (
              <>
                <p className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-xs leading-relaxed text-sky-100/90">
                  Este perfil existe apenas para RH (ponto, salários, documentos).
                  A pessoa <strong className="font-semibold">não consegue iniciar sessão</strong> na
                  aplicação.
                </p>
                <div>
                  <label
                    htmlFor="create-collab-fn"
                    className={`mb-2 block ${labelUi}`}
                  >
                    Função
                  </label>
                  <select
                    id="create-collab-fn"
                    value={createCollaboratorFunction}
                    onChange={(e) =>
                      setCreateCollaboratorFunction(
                        e.target.value as CollaboratorFunctionId,
                      )
                    }
                    className={inputClass}
                  >
                    {COLLABORATOR_FUNCTIONS.map((fn) => (
                      <option key={fn.value} value={fn.value}>
                        {fn.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                {variant !== "clientes" ? (
                  <div>
                    <label
                      htmlFor="create-email"
                      className={`mb-2 block ${labelUi}`}
                    >
                      Email
                    </label>
                    <input
                      id="create-email"
                      type="email"
                      autoComplete="off"
                      value={createEmail}
                      onChange={(e) => setCreateEmail(e.target.value)}
                      required
                      className={inputClass}
                    />
                    <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
                      O email é único em toda a plataforma.
                    </p>
                  </div>
                ) : null}
                <div>
                  <span className={`mb-2 block ${labelUi}`}>
                    Palavra-passe inicial
                  </span>
                  <div className="flex gap-2">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      required
                      minLength={8}
                      className={`min-w-0 flex-1 ${inputClass}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="shrink-0 rounded-xl border border-zinc-600/50 bg-zinc-800/60 px-3 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800"
                    >
                      {showPassword ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                </div>
              </>
            )}
            <div>
              <label
                htmlFor="create-phone"
                className={`mb-2 block ${labelUi}`}
              >
                Telefone{" "}
                <span className="font-normal normal-case tracking-normal text-zinc-600">
                  {variant === "clientes" ? "(usado no login)" : "(opcional)"}
                </span>
              </label>
              <input
                id="create-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={createPhone}
                onChange={(e) =>
                  setCreatePhone(formatWhatsAppMaskInput(e.target.value))
                }
                maxLength={18}
                required={variant === "clientes"}
                placeholder="+244 9XX XXX XXX"
                className={inputClass}
              />
              <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
                {PHONE_HINT}
              </p>
            </div>
            {createError ? (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-200">
                {createError}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={createLoading}
                onClick={() => setCreateModalOpen(false)}
                className={btnGhost}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createLoading}
                className={btnPrimary}
              >
                {createLoading
                  ? "A criar…"
                  : variant === "clientes"
                    ? "Criar cliente"
                    : "Criar utilizador"}
              </button>
            </div>
          </form>
        </ModalBackdrop>
      ) : null}

      {editUser ? (
        <ModalBackdrop
          title={
            variant === "clientes"
              ? "Editar cliente"
              : "Editar utilizador"
          }
          onClose={() => !editLoading && setEditUser(null)}
        >
          <form onSubmit={handleEditSubmit} className="flex flex-col gap-5">
            {isCollaboratorRole(editUser.role) ? (
              <p className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-xs leading-relaxed text-sky-100/90">
                Colaborador sem acesso ao sistema. Complete salário e documentos em{" "}
                <Link href={ROUTES.admin.rh} className="font-medium text-sky-300 underline">
                  Recursos Humanos
                </Link>
                . Para dar login, altere o perfil para Atendente, Designer ou Admin.
              </p>
            ) : variant !== "clientes" ? (
              <div>
                <span className={`mb-2 block ${labelUi}`}>Email</span>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                  className={inputClass}
                />
                <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
                  O email é único em toda a plataforma — não pode coincidir com
                  outra conta (cliente, admin ou equipa).
                </p>
              </div>
            ) : null}
            <div>
              <span className={`mb-2 block ${labelUi}`}>
                {editUser.role === "CLIENT" && editIsCompany
                  ? "Nome da empresa"
                  : "Nome"}
              </span>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                minLength={2}
                className={inputClass}
              />
            </div>
            {editUser.role === "CLIENT" ? (
              <>
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-zinc-700/70 bg-zinc-900/50 px-4 py-3.5">
                  <span>
                    <span className="block text-sm font-semibold text-zinc-100">
                      Conta de empresa
                    </span>
                    <span className="mt-0.5 block text-[11px] text-zinc-500">
                      Activa para pessoa jurídica com NIF obrigatório.
                    </span>
                  </span>
                  <span className="relative inline-flex shrink-0">
                    <input
                      type="checkbox"
                      checked={editIsCompany}
                      onChange={(e) => {
                        setEditIsCompany(e.target.checked);
                        if (!e.target.checked) setEditNif("");
                      }}
                      disabled={editLoading}
                      className="peer sr-only"
                    />
                    <span className="h-6 w-11 rounded-full bg-zinc-700 transition peer-checked:bg-amber-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber-500" />
                    <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
                  </span>
                </label>
                {editIsCompany ? (
                  <div>
                    <span className={`mb-2 block ${labelUi}`}>NIF da empresa</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editNif}
                      onChange={(e) => setEditNif(e.target.value)}
                      required
                      maxLength={32}
                      className={inputClass}
                      placeholder="Número de identificação fiscal"
                    />
                  </div>
                ) : null}
              </>
            ) : null}
            <div>
              <span className={`mb-2 block ${labelUi}`}>Telefone</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={editPhone}
                onChange={(e) =>
                  setEditPhone(formatWhatsAppMaskInput(e.target.value))
                }
                maxLength={18}
                required={editUser.role === "CLIENT"}
                placeholder="+244 9XX XXX XXX"
                className={inputClass}
              />
              <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
                {PHONE_HINT}{" "}
                {editUser.role === "CLIENT"
                  ? "Este número é usado no login."
                  : "Vazio remove o telefone."}
              </p>
            </div>
            {variant !== "clientes" ? (
              <div>
                <span className={`mb-2 block ${labelUi}`}>Perfil</span>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className={inputClass}
                >
                  {ROLES_TEAM.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {editError ? (
              <p className="text-sm text-red-300">{editError}</p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={editLoading}
                onClick={() => setEditUser(null)}
                className={`${btnGhost} sm:min-w-[7rem]`}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={editLoading}
                className={`${btnPrimary} sm:min-w-[7rem]`}
              >
                {editLoading ? "A guardar…" : "Guardar"}
              </button>
            </div>
          </form>
        </ModalBackdrop>
      ) : null}

      {pwdUser ? (
        <ModalBackdrop
          title={`Nova palavra-passe — ${pwdUser.name}`}
          onClose={() => !pwdLoading && setPwdUser(null)}
        >
          <p className="mb-5 text-sm leading-relaxed text-zinc-400">
            A sessão deste utilizador em todos os dispositivos será terminada.
          </p>
          <form onSubmit={handlePwdSubmit} className="flex flex-col gap-5">
            <div>
              <span className={`mb-2 block ${labelUi}`}>Nova palavra-passe</span>
              <input
                type="password"
                value={pwdNew}
                onChange={(e) => setPwdNew(e.target.value)}
                required
                minLength={8}
                className={inputClass}
              />
            </div>
            <div>
              <span className={`mb-2 block ${labelUi}`}>Confirmar</span>
              <input
                type="password"
                value={pwdNew2}
                onChange={(e) => setPwdNew2(e.target.value)}
                required
                minLength={8}
                className={inputClass}
              />
            </div>
            {pwdError ? (
              <p className="text-sm text-red-300">{pwdError}</p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={pwdLoading}
                onClick={() => setPwdUser(null)}
                className={btnGhost}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pwdLoading}
                className={btnPrimary}
              >
                {pwdLoading ? "A aplicar…" : "Redefinir"}
              </button>
            </div>
          </form>
        </ModalBackdrop>
      ) : null}

      {delUser ? (
        <ModalBackdrop
          title={
            variant === "clientes" ? "Eliminar cliente" : "Eliminar utilizador"
          }
          onClose={() => !delLoading && setDelUser(null)}
        >
          <p className="text-sm leading-relaxed text-zinc-300">
            Tem a certeza que pretende eliminar{" "}
            <span className="font-semibold text-white">{delUser.name}</span>
            {variant === "clientes"
              ? delUser.phone
                ? <>{" "}
                    <span className="text-zinc-500">({delUser.phone})</span>
                  </>
                : null
              : <>{" "}
                  <span className="text-zinc-500">({delUser.email})</span>
                </>}
            ?
          </p>
          <p className="mt-4 rounded-xl border border-zinc-700/60 bg-zinc-800/30 px-4 py-3 text-sm leading-relaxed text-zinc-500">
            Só é possível eliminar contas sem pedidos, arte, anotações ou outras
            ligações na plataforma.
          </p>
          {delError ? (
            <p className="mt-4 text-sm text-red-300">{delError}</p>
          ) : null}
          <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={delLoading}
              onClick={() => setDelUser(null)}
              className={btnGhost}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={delLoading}
              onClick={() => void handleDeleteConfirm()}
              className="rounded-xl bg-gradient-to-r from-red-600 to-red-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-red-900/20 transition hover:from-red-500 hover:to-red-400 disabled:opacity-50"
            >
              {delLoading ? "A eliminar…" : "Eliminar"}
            </button>
          </div>
        </ModalBackdrop>
      ) : null}
    </div>
  );
}
