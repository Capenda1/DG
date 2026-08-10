"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  adminUpdateBusinessProfileSettings,
  adminUpdateLoginAppearanceSettings,
  adminUpdatePaymentSettings,
  adminUpdateSmtpMailSettings,
  businessLogoDisplayUrl,
  getBusinessProfileSettings,
  getLoginAppearanceSettings,
  getPaymentSettings,
  getSmtpMailSettings,
  resetLoginBackground,
  uploadBusinessProfileLogo,
  uploadLoginBackground,
  type BusinessProfileSettings,
  type LoginAppearanceSettings,
  type PaymentSettings,
  type SmtpMailSettings,
} from "@/lib/api-client";
import {
  isSettingsTabId,
  SettingsSaveBar,
  SettingsTabNav,
  StatusBadge,
  type SettingsTabId,
} from "./_components/settings-ui";
import {
  PanelComprovantes,
  PanelEmpresa,
  PanelLoginAppearance,
  PanelPagamentos,
  PanelSistema,
} from "./_components/settings-panels";
import { PanelBackups } from "./_components/PanelBackups";
const DEFAULT_BUSINESS: BusinessProfileSettings = {
  companyName: "",
  legalName: "",
  tagline: "",
  logoUrl: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  provinceRegion: "",
  country: "Angola",
  phone: "",
  email: "",
  website: "",
  taxId: "",
  businessHours: "",
  socialFacebook: "",
  socialInstagram: "",
  notes: "",
  agtCertificationLine: "",
};

const DEFAULT_LOGIN_APPEARANCE: LoginAppearanceSettings = {
  backgroundUrl: "",
  overlayOpacity: 70,
  updatedAt: "",
};

const DEFAULT_SMTP: SmtpMailSettings = {
  enabled: false,
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTls: true,
  user: "",
  from: "",
  appName: "Dádiva Go",
  hasPassword: false,
};

const TAB_HEADINGS: Record<
  SettingsTabId,
  { title: string; description: string }
> = {
  empresa: {
    title: "Empresa",
    description:
      "Identidade, morada, contactos e informação institucional mostrada na loja e comprovantes.",
  },
  aparencia: {
    title: "Aparência",
    description:
      "Fundo fotográfico e overlay da página de login e recuperação de acesso.",
  },
  pagamentos: {
    title: "Pagamentos",
    description:
      "Dados bancários e WhatsApp apresentados ao cliente durante o checkout.",
  },
  comprovantes: {
    title: "Comprovantes",
    description: "Formato do PDF emitido no balcão, admin e área do cliente.",
  },
  sistema: {
    title: "Sistema",
    description:
      "Integrações internas — email SMTP para recuperação de acesso e notificações.",
  },
  backups: {
    title: "Backups",
    description:
      "Gere e descarregue cópias da base de dados e dos ficheiros para memória externa.",
  },
};

function readTabFromHash(): SettingsTabId {
  if (typeof window === "undefined") return "empresa";
  const hash = window.location.hash.replace("#", "");
  return isSettingsTabId(hash) ? hash : "empresa";
}

export default function AdminConfiguracoesPage() {
  const [tab, setTab] = useState<SettingsTabId>("empresa");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [biz, setBiz] = useState<BusinessProfileSettings>(DEFAULT_BUSINESS);
  const [loginAppearance, setLoginAppearance] =
    useState<LoginAppearanceSettings>(DEFAULT_LOGIN_APPEARANCE);
  const [form, setForm] = useState<PaymentSettings>({
    bankTransferSame: {
      enabled: true,
      accountNumber: "",
      accountName: "",
      bankName: "",
    },
    deposit: { enabled: true, accountNumber: "", bankName: "" },
    bankTransferExpress: { enabled: true, expressNumber: "", provider: "" },
    whatsappNumber: "",
    receiptPaperFormat: "THERMAL_80",
  });
  const [smtp, setSmtp] = useState<SmtpMailSettings>(DEFAULT_SMTP);
  const [smtpPassInput, setSmtpPassInput] = useState("");

  const [logoUploading, setLogoUploading] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const [bgUploading, setBgUploading] = useState(false);
  const [bgResetting, setBgResetting] = useState(false);
  const bgFileInputRef = useRef<HTMLInputElement>(null);

  const selectTab = useCallback((id: SettingsTabId) => {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
  }, []);

  useEffect(() => {
    setTab(readTabFromHash());
    const onHash = () => setTab(readTabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pay, profile, smtpSettings, loginApp] = await Promise.all([
        getPaymentSettings(),
        getBusinessProfileSettings(),
        getSmtpMailSettings(),
        getLoginAppearanceSettings(),
      ]);
      setForm(pay);
      setBiz(profile);
      setSmtp(smtpSettings);
      setLoginAppearance(loginApp);
      setSmtpPassInput("");
    } catch {
      setError("Não foi possível carregar as configurações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { hasPassword: _hp, ...smtpFields } = smtp;
      const smtpPayload: Parameters<typeof adminUpdateSmtpMailSettings>[0] = {
        ...smtpFields,
      };
      if (smtpPassInput.trim()) {
        smtpPayload.pass = smtpPassInput.trim();
      }
      const [payNext, bizNext, smtpNext, loginNext] = await Promise.all([
        adminUpdatePaymentSettings(form),
        adminUpdateBusinessProfileSettings(biz),
        adminUpdateSmtpMailSettings(smtpPayload),
        adminUpdateLoginAppearanceSettings({
          overlayOpacity: loginAppearance.overlayOpacity,
        }),
      ]);
      setForm(payNext);
      setBiz(bizNext);
      setSmtp(smtpNext);
      setLoginAppearance(loginNext);
      setSmtpPassInput("");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao guardar.");
    } finally {
      setSaving(false);
    }
  }

  function patch<K extends keyof PaymentSettings>(
    key: K,
    field: string,
    value: string | boolean,
  ) {
    setForm((prev) => {
      const cur = prev[key];
      if (typeof cur !== "object" || cur === null || Array.isArray(cur)) {
        return prev;
      }
      return {
        ...prev,
        [key]: { ...(cur as Record<string, string | boolean>), [field]: value },
      };
    });
  }

  function patchBiz<K extends keyof BusinessProfileSettings>(
    key: K,
    value: string,
  ) {
    setBiz((prev) => ({ ...prev, [key]: value }));
  }

  async function onLogoFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoUploading(true);
    setError(null);
    try {
      setBiz(await uploadBusinessProfileLogo(file));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível enviar o logo.",
      );
    } finally {
      setLogoUploading(false);
    }
  }

  async function onBgFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBgUploading(true);
    setError(null);
    try {
      setLoginAppearance(await uploadLoginBackground(file));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível enviar o fundo do login.",
      );
    } finally {
      setBgUploading(false);
    }
  }

  async function onResetLoginBackground() {
    setBgResetting(true);
    setError(null);
    try {
      setLoginAppearance(await resetLoginBackground());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível repor o fundo predefinido.",
      );
    } finally {
      setBgResetting(false);
    }
  }

  const heading = TAB_HEADINGS[tab];
  const logoPreviewSrc = businessLogoDisplayUrl(biz.logoUrl);

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-black pb-28">
      <div className="border-b border-zinc-800/60 bg-black/40 px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-400/80">
            Administração
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">Configurações</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Gerir perfil da empresa, pagamentos, comprovantes e email do sistema —
            organizado por área para encontrar rapidamente o que precisa.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {loading ? (
          <div className="flex h-64 items-center justify-center">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400" />
        </div>
      ) : (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <SettingsTabNav
              active={tab}
              onChange={selectTab}
              badges={{
                sistema: (
                  <StatusBadge
                    label={smtp.enabled ? "SMTP on" : "SMTP off"}
                    active={smtp.enabled}
                  />
                ),
              }}
            />

            <main className="min-w-0 flex-1">
              <header className="mb-5">
                <h2 className="text-lg font-semibold text-white">{heading.title}</h2>
                <p className="mt-1 text-sm text-zinc-500">{heading.description}</p>
              </header>

              {tab === "empresa" ? (
                <PanelEmpresa
                  biz={biz}
                  patchBiz={patchBiz}
                  logoPreviewSrc={logoPreviewSrc}
                  logoFileInputRef={logoFileInputRef}
                  logoUploading={logoUploading}
                  saving={saving}
                  onLogoFileSelected={onLogoFileSelected}
                />
              ) : null}

              {tab === "aparencia" ? (
                <PanelLoginAppearance
                  loginAppearance={loginAppearance}
                  onOverlayChange={(v) =>
                    setLoginAppearance((prev) => ({ ...prev, overlayOpacity: v }))
                  }
                  bgFileInputRef={bgFileInputRef}
                  bgUploading={bgUploading}
                  bgResetting={bgResetting}
                  saving={saving}
                  onBgFileSelected={onBgFileSelected}
                  onResetBackground={onResetLoginBackground}
                />
              ) : null}

              {tab === "pagamentos" ? (
                <PanelPagamentos
                  form={form}
                  patch={patch}
                  setWhatsapp={(v) =>
                    setForm((prev) => ({ ...prev, whatsappNumber: v }))
                  }
                />
              ) : null}

              {tab === "comprovantes" ? (
                <PanelComprovantes
                  format={form.receiptPaperFormat}
                  onFormatChange={(v) =>
                    setForm((prev) => ({ ...prev, receiptPaperFormat: v }))
                  }
                />
              ) : null}

              {tab === "sistema" ? (
                <PanelSistema
                  smtp={smtp}
                  smtpPassInput={smtpPassInput}
                  onSmtpChange={(patch) =>
                    setSmtp((prev) => ({ ...prev, ...patch }))
                  }
                  onSmtpPassChange={setSmtpPassInput}
                />
              ) : null}

              {tab === "backups" ? <PanelBackups /> : null}
            </main>
          </div>
        )}
          </div>

      {!loading && tab !== "backups" ? (
        <SettingsSaveBar
          saving={saving}
          saved={saved}
          error={error}
          onSave={() => void save()}
        />
      ) : null}
    </div>
  );
}
