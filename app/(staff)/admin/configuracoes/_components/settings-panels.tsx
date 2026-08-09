"use client";

import type { ChangeEvent, RefObject } from "react";
import type {
  BusinessProfileSettings,
  LoginAppearanceSettings,
  PaymentSettings,
  SmtpMailSettings,
} from "@/lib/api-client";
import { loginBackgroundDisplayUrl } from "@/lib/login-branding";
import { RECEIPT_PDF_FORMAT_LABELS } from "@/lib/payment-receipt-pdf";
import {
  BankMethodCard,
  Field,
  FieldNumber,
  FieldPassword,
  FieldTextarea,
  InfoCallout,
  SubPanel,
  ToggleSwitch,
} from "./settings-ui";
import { PanelMfaAdmin } from "./PanelMfaAdmin";

type PatchBiz = <K extends keyof BusinessProfileSettings>(
  key: K,
  value: string,
) => void;

type PatchPayment = (
  key: keyof PaymentSettings,
  field: string,
  value: string | boolean,
) => void;

export function PanelEmpresa({
  biz,
  patchBiz,
  logoPreviewSrc,
  logoFileInputRef,
  logoUploading,
  saving,
  onLogoFileSelected,
}: {
  biz: BusinessProfileSettings;
  patchBiz: PatchBiz;
  logoPreviewSrc: string | undefined;
  logoFileInputRef: RefObject<HTMLInputElement | null>;
  logoUploading: boolean;
  saving: boolean;
  onLogoFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-5">
      <SubPanel
        title="Identidade"
        description="Nome comercial, razão social e logótipo visíveis na loja e comprovantes."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Nome comercial"
            hint="Ex.: Dádiva Go"
            value={biz.companyName}
            onChange={(v) => patchBiz("companyName", v)}
          />
          <Field
            label="Razão social"
            hint="Denominação legal"
            value={biz.legalName}
            onChange={(v) => patchBiz("legalName", v)}
          />
          <div className="sm:col-span-2">
            <Field
              label="Slogan"
              hint="Breve frase sob o nome"
              value={biz.tagline}
              onChange={(v) => patchBiz("tagline", v)}
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
          <p className="mb-4 text-xs leading-relaxed text-zinc-500">
            Logótipo por URL ou upload (PNG, JPEG, WEBP, SVG até 3&nbsp;MB). O upload
            grava no servidor; confirme com Guardar.
          </p>
          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            <div className="min-w-0 flex-1 space-y-4">
              <Field
                label="URL ou caminho do logo"
                hint="https://… · /marcas/logo.svg"
                value={biz.logoUrl}
                onChange={(v) => patchBiz("logoUrl", v)}
                mono
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="sr-only"
                  onChange={(e) => void onLogoFileSelected(e)}
                />
                <button
                  type="button"
                  disabled={logoUploading || saving}
                  onClick={() => logoFileInputRef.current?.click()}
                  className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20 disabled:opacity-45"
                >
                  {logoUploading ? "A enviar…" : "Carregar imagem"}
                </button>
              </div>
            </div>
            {logoPreviewSrc ? (
              <div className="flex shrink-0 justify-center md:justify-end">
                <div className="flex h-28 w-32 items-center justify-center rounded-xl border border-white/10 bg-zinc-950/80 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoPreviewSrc}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </SubPanel>

      <SubPanel title="Localização" description="Morada da loja ou sede.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              label="Linha 1"
              hint="Rua, número, prédio"
              value={biz.addressLine1}
              onChange={(v) => patchBiz("addressLine1", v)}
            />
          </div>
          <div className="sm:col-span-2">
            <Field
              label="Linha 2"
              hint="Andar, porta (opcional)"
              value={biz.addressLine2}
              onChange={(v) => patchBiz("addressLine2", v)}
            />
          </div>
          <Field
            label="Cidade"
            value={biz.city}
            onChange={(v) => patchBiz("city", v)}
          />
          <Field
            label="Província / região"
            value={biz.provinceRegion}
            onChange={(v) => patchBiz("provinceRegion", v)}
          />
          <Field
            label="País"
            value={biz.country}
            onChange={(v) => patchBiz("country", v)}
          />
        </div>
      </SubPanel>

      <SubPanel
        title="Contacto público"
        description="Telefone, email institucional e website."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Telefone"
            hint="+244 ou 924…"
            value={biz.phone}
            onChange={(v) => patchBiz("phone", v)}
            mono
          />
          <Field
            label="E-mail institucional"
            hint="geral@empresa.co.ao"
            value={biz.email}
            onChange={(v) => patchBiz("email", v)}
            type="email"
          />
          <div className="sm:col-span-2">
            <Field
              label="Website"
              hint="https://…"
              value={biz.website}
              onChange={(v) => patchBiz("website", v)}
              mono
              type="url"
            />
          </div>
        </div>
      </SubPanel>

      <div className="grid gap-5 lg:grid-cols-2">
        <SubPanel title="Fiscal e horário">
          <Field
            label="NIF / Contribuinte"
            hint="Número fiscal"
            value={biz.taxId}
            onChange={(v) => patchBiz("taxId", v)}
            mono
          />
          <FieldTextarea
            label="Licença AGT (programa certificado)"
            hint="L3+3 – Processado por programa certificado nº 259/AGT/2020 ©Magnisoft®-OranGest"
            rows={2}
            value={biz.agtCertificationLine}
            onChange={(v) => patchBiz("agtCertificationLine", v)}
          />
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Aparece no rodapé de facturas, recibos, relatórios e outros documentos
            emitidos pelo sistema — letra pequena, no final da página.
          </p>
          <FieldTextarea
            label="Horário de funcionamento"
            hint={"Seg–Sex 8h–18h\nSáb 9h–13h"}
            rows={4}
            value={biz.businessHours}
            onChange={(v) => patchBiz("businessHours", v)}
          />
        </SubPanel>

        <SubPanel title="Redes sociais">
          <Field
            label="Facebook"
            hint="https://facebook.com/…"
            value={biz.socialFacebook}
            onChange={(v) => patchBiz("socialFacebook", v)}
            mono
            type="url"
          />
          <Field
            label="Instagram"
            hint="https://instagram.com/…"
            value={biz.socialInstagram}
            onChange={(v) => patchBiz("socialInstagram", v)}
            mono
            type="url"
          />
        </SubPanel>
      </div>

      <SubPanel
        title="Notas institucionais"
        description="Texto livre para políticas, observações ou mensagem pública."
      >
        <FieldTextarea
          label="Notas públicas"
          hint="Política de trocas, avisos legais, etc."
          rows={5}
          value={biz.notes}
          onChange={(v) => patchBiz("notes", v)}
        />
      </SubPanel>
    </div>
  );
}

export function PanelPagamentos({
  form,
  patch,
  setWhatsapp,
}: {
  form: PaymentSettings;
  patch: PatchPayment;
  setWhatsapp: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <SubPanel
        title="Métodos bancários"
        description="Dados mostrados ao cliente no checkout — um cartão por método."
      >
        <div className="grid gap-5 xl:grid-cols-3">
          <BankMethodCard
            title="Transferência — mesmo banco"
            subtitle="IBAN, titular e banco"
            accent="violet"
            headerExtra={
              <ToggleSwitch
                label="Disponível no checkout"
                hint="Cliente pode escolher este método ao submeter o pedido."
                checked={form.bankTransferSame.enabled !== false}
                onChange={(v) => patch("bankTransferSame", "enabled", v)}
              />
            }
            highlight={
              <Field
                label="IBAN / Conta"
                hint="AO06 0000 …"
                value={form.bankTransferSame.accountNumber}
                onChange={(v) => patch("bankTransferSame", "accountNumber", v)}
                mono
              />
            }
          >
            <Field
              label="Titular"
              value={form.bankTransferSame.accountName}
              onChange={(v) => patch("bankTransferSame", "accountName", v)}
            />
            <Field
              label="Banco"
              hint="BFA · BAI · BIC"
              value={form.bankTransferSame.bankName}
              onChange={(v) => patch("bankTransferSame", "bankName", v)}
            />
          </BankMethodCard>

          <BankMethodCard
            title="Depósito em balcão"
            subtitle="Conta para depósito presencial"
            accent="emerald"
            headerExtra={
              <ToggleSwitch
                label="Disponível no checkout"
                hint="Cliente pode escolher este método ao submeter o pedido."
                checked={form.deposit.enabled !== false}
                onChange={(v) => patch("deposit", "enabled", v)}
              />
            }
            highlight={
              <Field
                label="Número de conta"
                value={form.deposit.accountNumber}
                onChange={(v) => patch("deposit", "accountNumber", v)}
                mono
              />
            }
          >
            <Field
              label="Banco"
              value={form.deposit.bankName}
              onChange={(v) => patch("deposit", "bankName", v)}
            />
          </BankMethodCard>

          <BankMethodCard
            title="Transferência express"
            subtitle="Multicaixa express ou similar"
            accent="amber"
            headerExtra={
              <ToggleSwitch
                label="Disponível no checkout"
                hint="Cliente pode escolher este método ao submeter o pedido."
                checked={form.bankTransferExpress.enabled !== false}
                onChange={(v) => patch("bankTransferExpress", "enabled", v)}
              />
            }
            highlight={
              <Field
                label="Número / referência"
                hint="+244 9XX XXX XXX"
                value={form.bankTransferExpress.expressNumber}
                onChange={(v) => patch("bankTransferExpress", "expressNumber", v)}
                mono
              />
            }
          >
            <Field
              label="Operador"
              value={form.bankTransferExpress.provider}
              onChange={(v) => patch("bankTransferExpress", "provider", v)}
            />
          </BankMethodCard>
        </div>
      </SubPanel>

      <SubPanel
        title="WhatsApp de pedidos"
        description="Número usado para contacto sobre encomendas (distinto do telefone institucional)."
      >
        <Field
          label="Número (código país, sem +)"
          hint="244923000000"
          value={form.whatsappNumber ?? ""}
          onChange={setWhatsapp}
          mono
        />
      </SubPanel>

      <InfoCallout title="Pagamento em dinheiro físico">
        Não requer configuração adicional. O cliente é informado de que deve pagar
        presencialmente no local.
      </InfoCallout>
    </div>
  );
}

export function PanelComprovantes({
  format,
  onFormatChange,
}: {
  format: PaymentSettings["receiptPaperFormat"];
  onFormatChange: (v: PaymentSettings["receiptPaperFormat"]) => void;
}) {
  const options = [
    { value: "THERMAL_80" as const, label: RECEIPT_PDF_FORMAT_LABELS.THERMAL_80 },
    {
      value: "THERMAL_58_BW" as const,
      label: RECEIPT_PDF_FORMAT_LABELS.THERMAL_58_BW,
    },
    { value: "A5_BW" as const, label: RECEIPT_PDF_FORMAT_LABELS.A5_BW },
    { value: "A4_BW" as const, label: RECEIPT_PDF_FORMAT_LABELS.A4_BW },
    { value: "A4" as const, label: RECEIPT_PDF_FORMAT_LABELS.A4 },
  ];

  return (
    <div className="space-y-5">
      <SubPanel
        title="Formato do PDF"
        description="Usado no balcão, admin e área do cliente. Deve coincidir com o papel ou impressora do sistema."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((opt) => {
            const selected = format === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 transition ${
                  selected
                    ? "border-amber-400/45 bg-amber-400/10 ring-1 ring-amber-400/30"
                    : "border-white/[0.07] bg-black/20 hover:border-zinc-600"
                }`}
              >
                <input
                  type="radio"
                  name="receiptPaperFormat"
                  value={opt.value}
                  checked={selected}
                  onChange={() => onFormatChange(opt.value)}
                  className="mt-1 h-4 w-4 shrink-0 accent-amber-400"
                />
                <span className="text-sm font-medium leading-snug text-zinc-200">
                  {opt.label}
                </span>
              </label>
            );
          })}
        </div>
      </SubPanel>
    </div>
  );
}

export function PanelSistema({
  smtp,
  smtpPassInput,
  onSmtpChange,
  onSmtpPassChange,
}: {
  smtp: SmtpMailSettings;
  smtpPassInput: string;
  onSmtpChange: (patch: Partial<SmtpMailSettings>) => void;
  onSmtpPassChange: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <SubPanel
        title="Email (SMTP)"
        description="Envio de emails do sistema — recuperação de acesso admin, notificações futuras."
      >
        <ToggleSwitch
          label="Usar SMTP configurado aqui"
          hint="Desactivado: usa variáveis EMAIL_* do servidor (.env). Activado: usa estes dados guardados na base de dados."
          checked={smtp.enabled}
          onChange={(v) => onSmtpChange({ enabled: v })}
        />

        <InfoCallout tone={smtp.enabled ? "success" : "info"}>
          {smtp.enabled ? (
            <>
              SMTP activo na base de dados
              {smtp.user ? (
                <>
                  {" "}
                  — conta <strong className="text-zinc-200">{smtp.user}</strong>
                </>
              ) : null}
              .
            </>
          ) : (
            <>
              A usar configuração do servidor (.env). Active acima para mudar conta
              Gmail sem alterar código ou redeploy.
            </>
          )}
        </InfoCallout>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Servidor SMTP"
            hint="smtp.gmail.com"
            value={smtp.host}
            onChange={(v) => onSmtpChange({ host: v })}
            mono
          />
          <FieldNumber
            label="Porta"
            value={smtp.port}
            onChange={(v) => onSmtpChange({ port: v })}
            min={1}
            max={65535}
          />
          <Field
            label="Utilizador / email"
            hint="conta@gmail.com"
            value={smtp.user}
            onChange={(v) => onSmtpChange({ user: v })}
            mono
          />
          <FieldPassword
            label="Senha de app"
            hint={
              smtp.hasPassword
                ? "Deixe vazio para manter a actual"
                : "16 caracteres (Gmail)"
            }
            value={smtpPassInput}
            onChange={onSmtpPassChange}
          />
          <div className="sm:col-span-2">
            <Field
              label="Remetente (From)"
              hint="Dádiva Go <conta@gmail.com>"
              value={smtp.from}
              onChange={(v) => onSmtpChange({ from: v })}
            />
          </div>
          <Field
            label="Nome nos emails"
            hint="Dádiva Go"
            value={smtp.appName}
            onChange={(v) => onSmtpChange({ appName: v })}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleSwitch
            label="SSL directo (porta 465)"
            checked={smtp.secure}
            onChange={(v) => onSmtpChange({ secure: v })}
          />
          <ToggleSwitch
            label="STARTTLS (porta 587)"
            checked={smtp.requireTls}
            onChange={(v) => onSmtpChange({ requireTls: v })}
          />
        </div>

        <InfoCallout tone="neutral">
          <strong className="text-zinc-300">Gmail:</strong> active verificação em 2
          passos e crie uma senha de app em Conta Google → Segurança. Servidor{" "}
          <code className="text-zinc-300">smtp.gmail.com</code>, porta{" "}
          <code className="text-zinc-300">587</code>, STARTTLS activo.
        </InfoCallout>
      </SubPanel>

      <PanelMfaAdmin />
    </div>
  );
}

export function PanelLoginAppearance({
  loginAppearance,
  onOverlayChange,
  bgFileInputRef,
  bgUploading,
  bgResetting,
  saving,
  onBgFileSelected,
  onResetBackground,
}: {
  loginAppearance: LoginAppearanceSettings;
  onOverlayChange: (value: number) => void;
  bgFileInputRef: RefObject<HTMLInputElement | null>;
  bgUploading: boolean;
  bgResetting: boolean;
  saving: boolean;
  onBgFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
  onResetBackground: () => void;
}) {
  const previewSrc = loginBackgroundDisplayUrl(
    loginAppearance.backgroundUrl,
    loginAppearance.updatedAt,
  );
  const hasCustomBg = Boolean(loginAppearance.backgroundUrl?.trim());

  return (
    <div className="space-y-5">
      <SubPanel
        title="Fundo do login"
        description="Imagem de fundo em /login e fluxos de recuperação de acesso. Recomendado 16:9 (ex.: 1920×1080), PNG, JPEG ou WEBP até 5 MB."
      >
        <InfoCallout tone="neutral">
          Por segurança, só são aceites imagens enviadas pelo servidor — não é
          possível colar URLs externas. Sem upload, usa-se a imagem predefinida
          do site.
        </InfoCallout>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]">
          <div className="space-y-4">
            <FieldNumber
              label="Intensidade do overlay (%)"
              value={loginAppearance.overlayOpacity}
              min={0}
              max={100}
              onChange={onOverlayChange}
            />
            <p className="text-xs leading-relaxed text-zinc-500">
              Controla o véu claro/escuro sobre a foto. Valores mais altos
              deixam o cartão de login mais legível; mais baixos mostram mais a
              imagem.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                ref={bgFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => void onBgFileSelected(e)}
              />
              <button
                type="button"
                disabled={bgUploading || bgResetting || saving}
                onClick={() => bgFileInputRef.current?.click()}
                className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20 disabled:opacity-45"
              >
                {bgUploading ? "A enviar…" : "Carregar imagem"}
              </button>
              <button
                type="button"
                disabled={!hasCustomBg || bgUploading || bgResetting || saving}
                onClick={() => void onResetBackground()}
                className="rounded-xl border border-zinc-600/60 bg-zinc-900/50 px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800/80 disabled:opacity-45"
              >
                {bgResetting ? "A repor…" : "Repor predefinida"}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/80">
            <div className="border-b border-white/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Pré-visualização 16:9
            </div>
            <div className="relative aspect-video w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-center"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.visibility = "hidden";
                }}
              />
              <div
                className="absolute inset-0 bg-gradient-to-br from-white/85 via-white/70 to-zinc-100/80 dark:from-black/70 dark:via-black/50 dark:to-black/75"
                style={{
                  opacity: loginAppearance.overlayOpacity / 100,
                }}
              />
            </div>
          </div>
        </div>
      </SubPanel>
    </div>
  );
}
