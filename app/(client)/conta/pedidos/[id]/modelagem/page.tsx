"use client";

/* eslint-disable @next/next/no-img-element -- recorte e miniaturas com URLs dinâmicas (blob/data) */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  type ApiRequestError,
  createDesignTemplate,
  DESIGN_TEMPLATE_CATEGORY_LABELS,
  type DesignTemplateCategory,
  fetchOrderModelagemFileBlob,
  getOrder,
  getUnreadCount,
  listOrderModelagemFiles,
  type OrderDetail,
  type OrderModelagemFile,
  type PaymentMethodValue,
  saveOrderModelagemComposition,
  submitOrder,
  uploadOrderModelagemFile,
} from "@/lib/api-client";
import {
  ModelagemActionBar,
  ModelagemSidePanelTabs,
  type ModelagemSidePanelTab,
} from "@/components/modelagem/ModelagemActionBar";
import { ModelagemContextSections } from "@/components/modelagem/ModelagemContextSections";
import { ModelagemEmptyState } from "@/components/modelagem/ModelagemEmptyState";
import { ModelagemPageHeader } from "@/components/modelagem/ModelagemPageHeader";
import { TemplatesModal, type ApplyMode } from "@/components/modelagem/TemplatesModal";
import { SubmitOrderModal } from "@/components/modelagem/SubmitOrderModal";
import { ModelagemSpecsCard } from "@/components/modelagem/ModelagemSpecsCard";
import { resolveModelagemPreviewFromOrder } from "@/lib/modelagem-preview";
import { loadSession } from "@/lib/auth-session";
import {
  MODELAGEM_COMPOSITE_SIZE,
  nextZIndex,
  sortLayersByZ,
  type DesignLayer,
  type ImageDesignLayer,
  type TextDesignLayer,
} from "@/lib/modelagem-layers";
import {
  parseModelagemSpecsFromOrder,
} from "@/lib/modelagem-specs";
import {
  downloadModelagemSpecsExcelCsv,
  downloadModelagemSpecsPdf,
  modelagemSpecsHasExportableContent,
} from "@/lib/modelagem-specs-export";
import { randomClientId } from "@/lib/random-id";
import {
  sanitizeSignedIntString,
  sanitizeUnsignedDecimalString,
  sanitizeUnsignedIntString,
} from "@/lib/numeric-input";
import { orderIsBalcao } from "@/lib/order-client-mutations";
import {
  modelagemLayersDirty,
  modelagemLayersFingerprint,
} from "@/lib/modelagem-dirty";
import {
  accountPedidosIndexHref,
  contaPedidoArtigosPath,
  contaPedidoPath,
  hardNavigateReplace,
  modelagemExitOverviewHref,
  ROUTES,
  isStaffRole,
} from "@/lib/routes";
import {
  ProductMockupViewer,
} from "@/components/modelagem/ProductMockupViewer";
import {
  type MockupViewer2DHandle,
} from "@/components/modelagem/MockupViewer2D";
import { ModelagemColorPalette } from "@/components/modelagem/ModelagemColorPalette";
import type { LayerTransformPatch } from "@/components/modelagem/modelagem-touch-gestures";

/* ── Constantes ── */
const W = MODELAGEM_COMPOSITE_SIZE; // 512

/* Camada de texto com opções tipográficas adicionais */
type TextEffect = "normal" | "curved" | "3d";

/** Estilo do arco curvo — «upright» e «wave» são mais actuais que «radial» (emblema clássico). */
type CurveStyle = "upright" | "wave" | "radial";

type TextLayerEx = TextDesignLayer & {
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  opacity: number;                        // 0–1
  strokeColor: string;                    // hex, "" = sem contorno
  strokeWidth: number;                    // px canvas
  textEffect: TextEffect;
  curveRadius: number;                    // raio / intensidade da curva (60–800)
  curveFlip: boolean;                     // false = sorriso, true = frown
  curveStyle: CurveStyle;
  depth3d: number;                        // camadas de profundidade (1–24)
  depthColor: string;                     // cor das camadas de profundidade
  textAlign: "left" | "center" | "right"; // alinhamento horizontal
  letterSpacing: number;                  // px entre caracteres (0–20)
  side: "front" | "back";                // frente ou costas da peça
  /** Arte do catálogo de modelos ou snapshot do designer — read-only para o cliente em SUBMITTED. */
  designerModel?: boolean;
};

/* Camada de imagem com extensões */
type ImageLayerEx = ImageDesignLayer & {
  opacity: number;
  flipX: boolean;
  /** Nome original do ficheiro (para exibir na lista de camadas). */
  name?: string;
  /** Referência opcional ao ficheiro uploadado na modelagem — permite guardar só a ref. no rascunho. */
  orderModelagemFileId?: string;
  side: "front" | "back";
  /** Arte do catálogo de modelos ou snapshot do designer — read-only para o cliente em SUBMITTED. */
  designerModel?: boolean;
};

type AnyLayer = TextLayerEx | ImageLayerEx;

const FONTS = [
  // ── Fontes do sistema ──
  { id: "sans",       label: "Sans-serif",       css: "ui-sans-serif, system-ui, Arial, sans-serif", google: false },
  { id: "serif",      label: "Serif",             css: "Georgia, 'Times New Roman', serif",           google: false },
  { id: "mono",       label: "Monospace",         css: "'Courier New', monospace",                    google: false },
  { id: "cursive",    label: "Cursiva (sistema)", css: "cursive",                                     google: false },
  { id: "impact",     label: "Impact",            css: "Impact, 'Arial Black', sans-serif",           google: false },
  /** Pilha só para glyphs emoji / pictogramas colour no canvas. */
  { id: "emoji",      label: "Emoji / símbolos", css: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif', google: false },
  // ── Google Fonts ──
  { id: "montserrat", label: "Montserrat",        css: "'Montserrat', sans-serif",                    google: true  },
  { id: "oswald",     label: "Oswald",            css: "'Oswald', sans-serif",                        google: true  },
  { id: "bebas",      label: "Bebas Neue",        css: "'Bebas Neue', sans-serif",                    google: true  },
  { id: "pacifico",   label: "Pacifico",          css: "'Pacifico', cursive",                         google: true  },
  { id: "dancing",    label: "Dancing Script",    css: "'Dancing Script', cursive",                   google: true  },
  { id: "playfair",   label: "Playfair Display",  css: "'Playfair Display', serif",                   google: true  },
] as const;
type FontId = (typeof FONTS)[number]["id"];

/** Emojis principais por categorias (cada entrada = uma camada de texto). */
const EMOJI_QUICK: string[] = [
  /* Rostos e emoções */
  "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😋", "😎", "🤓", "🧐", "😕", "😟", "😢", "😭", "😤", "😡", "🤬", "🥶", "🤯", "🥳", "😴", "🤮", "🤒", "🤠", "🥸", "💀", "👻", "👽", "🤖", "😈", "🤡", "😺", "😹", "😻",
  /* Mãos e corpo */
  "👋", "🤚", "✋", "🖐", "✌", "🤞", "🫰", "👍", "👎", "👊", "✊", "🤝", "🙏", "👏", "🙌", "👐", "🤲", "💪", "🦵", "👀", "👅", "🫂",
  /* Corações e romance */
  "❤️", "🩷", "🩵", "🧡", "💛", "💚", "💙", "💜", "🖤", "🩶", "🤍", "🤎", "💔", "❣️", "💕", "💖", "💗", "💘", "💝", "💞", "💟", "💋",
  /* Símbolos e sinais */
  "✨", "⭐", "🌟", "💫", "⚡", "🔥", "💥", "💢", "💯", "♨️", "💤", "💨", "✅", "❌", "❓", "❗", "💬", "💭", "🗯️", "♻️", "✳️", "❇️", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟤",
  /* Som e media */
  "🎵", "🎶", "🎤", "🎧", "📻", "🔔", "📣", "📢", "🔊", "🔇",
  /* Tech e trabalho */
  "📱", "☎️", "💻", "🖥", "⌨️", "🖱", "💾", "📷", "📹", "📺", "🔋", "💡", "📧", "📩", "📬", "📅", "📆", "⏰", "⏱", "🔍", "🔎", "🔑", "🔒", "🔓",
  /* Casa e dia a dia */
  "🏠", "🏢", "🛏", "🛁", "🚿", "🧸", "🎁", "🎀", "🪄", "🧲",
  /* Comida e bebida */
  "☕", "🍵", "🧃", "🍺", "🍷", "🥤", "🍕", "🍔", "🍟", "🌭", "🌮", "🍰", "🎂", "🍫", "🍿", "🍎", "🍊", "🍌", "🍇", "🍓",
  /* Desporto e jogos */
  "⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏓", "🎳", "🎮", "🎯", "🎲", "🃏", "🎊", "🎉", "🎈", "🎪",
  /* Natureza e tempo */
  "☀️", "🌤", "⛅", "☁️", "🌧", "⛈", "🌈", "❄️", "☃️", "💧", "🌊", "🌙", "🌴", "🌵", "🌸", "🌹", "🌻", "🍀", "🍂", "🌍", "🌎", "🌏",
  /* Transportes */
  "🚗", "🚕", "🚌", "🚎", "🚓", "🚒", "🚑", "✈️", "🛫", "🚀", "🛸", "⛵", "🛳", "🚲", "🏍",
  /* Prêmios e festa */
  "🏆", "🥇", "🥈", "🥉", "🎖", "🎗", "👑", "💎", "🏅",
  /* Animais */
  "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🦄", "🐝", "🦋", "🐢", "🐍", "🐙", "🦀", "🐟",
  /* Aniversário e festa (atalhos; bolo, balões e ofertas também noutras categorias) */
  "🧁", "🪅", "🎆", "🎇", "🪩", "🍾", "🥂", "🎠", "🎡", "🎢", "🕯️", "🤪", "🍭", "🍬", "🧨", "👶", "🍼", "💐", "🌺", "🌷", "🫶",
];

const STICKERS_EMOJI_PANEL_STORAGE_KEY = "dadivago-modelagem-stickers-panel-open";

/** Stickers vectoriais (PNG/SVG como camada imagem — data URL). */
const VECTOR_STICKERS: { id: string; label: string; svg: string }[] = [
  {
    id: "heart",
    label: "Coração",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#f43f5e" d="M32 54L10 32c-5.5-5.5-5.5-14.5 0-20s14.5-5.5 20 0l2 2 2-2c5.5-5.5 14.5-5.5 20 0s5.5 14.5 0 20L32 54z"/></svg>`,
  },
  {
    id: "star",
    label: "Estrela",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#fbbf24" stroke="#d97706" stroke-width="1.5" d="M32 6l7.5 17.8L58 26l-14 12.5L48 58 32 48.5 16 58l4-19.5L6 26l18.5-2.2L32 6z"/></svg>`,
  },
  {
    id: "bolt",
    label: "Relâmpago",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#facc15" d="M38 4L14 34h14l-4 26 26-34H36L38 4z"/></svg>`,
  },
  {
    id: "flame",
    label: "Chama",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#fb923c" d="M32 58c10-8 14-18 12-28-2-8-10-14-14-22-4 8-8 14-14 22-6 14 2 24 16 28z"/><path fill="#fdba74" d="M32 52c6-5 9-11 8-18-3 4-8 11-8 18z"/></svg>`,
  },
  {
    id: "crown",
    label: "Coroa",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#eab308" stroke="#a16207" stroke-width="1.2" d="M8 52h48L52 22 40 30 32 14 24 30 12 22zm8 0v8h32v-8"/></svg>`,
  },
  {
    id: "ribbon",
    label: "Fita",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><ellipse cx="28" cy="18" rx="14" ry="10" fill="#ec4899"/><ellipse cx="36" cy="18" rx="14" ry="10" fill="#db2777"/><path fill="#be185d" d="M32 26l-8 28 8-12 8 12"/></svg>`,
  },
  {
    id: "sparkle",
    label: "Brilho",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#a78bfa" d="M32 8l4 14 14 4-14 4-4 14-4-14L14 26l14-4z"/><circle cx="46" cy="42" r="5" fill="#c4b5fd"/><circle cx="18" cy="44" r="4" fill="#ddd6fe"/></svg>`,
  },
  {
    id: "thumbs",
    label: "OK",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#60a5fa" d="M22 54V30h-6c-4 0-8 4-8 10v14h14zm4-26h26c6 0 10 5 10 12 0 2-1 4-3 8l-4 11H26V28z"/></svg>`,
  },
  {
    id: "medal",
    label: "Medalha",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="20" r="15" fill="#fbbf24" stroke="#d97706" stroke-width="1.5"/><path fill="#78716c" d="M20 34h24l-6 22-6-10-6 10"/></svg>`,
  },
  {
    id: "rocket",
    label: "Foguete",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#e2e8f0" d="M32 8l8 28 12 6-28 22V36l16-14z"/><path fill="#fca5a5" d="M32 8v14"/><ellipse cx="20" cy="44" rx="8" ry="5" fill="#fb923c" transform="rotate(-35 20 44)"/><ellipse cx="44" cy="44" rx="8" ry="5" fill="#fb923c" transform="rotate(35 44 44)"/></svg>`,
  },
  {
    id: "soccer",
    label: "Bola",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="21" fill="#fafafa" stroke="#0f172a" stroke-width="2"/><path fill="none" stroke="#0f172a" stroke-width="1.2" d="M32 14v36M14 32h36M20 20l24 24M44 20L20 44"/></svg>`,
  },
  {
    id: "basketball",
    label: "Basquete",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="21" fill="#ea580c" stroke="#9a3412" stroke-width="2"/><path fill="none" stroke="#0f172a" stroke-width="1.5" d="M32 11c8 10 8 30 0 40M11 32h42M16 16c10 6 22 6 32 0M16 48c10-6 22-6 32 0"/></svg>`,
  },
  {
    id: "gift",
    label: "Presente",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect x="14" y="28" width="36" height="28" rx="3" fill="#dc2626"/><rect x="30" y="28" width="4" height="28" fill="#b91c1c"/><path fill="#fecaca" d="M18 28c0-8 6-14 14-14s14 6 14 14H18z"/></svg>`,
  },
  {
    id: "diamond",
    label: "Diamante",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#38bdf8" d="M32 8L10 28h44L32 8z"/><path fill="#0ea5e9" d="M10 28l22 28 22-28"/></svg>`,
  },
  {
    id: "note",
    label: "Nota",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><ellipse cx="22" cy="46" rx="14" ry="8" fill="#1e293b"/><path fill="#0f172a" d="M28 10c10 4 18 16 10 30-4 8-14 10-22 6"/></svg>`,
  },
  {
    id: "mug",
    label: "Caneca",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect x="16" y="16" width="28" height="32" rx="4" fill="#78350f"/><path fill="none" stroke="#78350f" stroke-width="4" stroke-linecap="round" d="M44 26c10 2 14 10 14 16s-10 14-22 14"/><rect x="22" y="22" width="16" height="5" rx="1" fill="#fef3c7"/></svg>`,
  },
  {
    id: "pizza",
    label: "Pizza",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#fbbf24" d="M32 8L8 56h48L32 8z"/><circle cx="28" cy="38" r="3" fill="#dc2626"/><circle cx="40" cy="42" r="2.5" fill="#15803d"/><circle cx="34" cy="48" r="2" fill="#1e293b"/></svg>`,
  },
  {
    id: "check",
    label: "Visto",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#22c55e"/><path fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" d="M18 34l10 10 18-22"/></svg>`,
  },
  {
    id: "cross",
    label: "Cruz",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#ef4444"/><path stroke="#fff" stroke-width="5" stroke-linecap="round" d="M22 22l20 20M42 22L22 42"/></svg>`,
  },
  {
    id: "shield",
    label: "Escudo",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#6366f1" stroke="#312e81" stroke-width="2" d="M32 8l16 8v16c0 14-8 22-16 24-8-2-16-10-16-24V16l16-8z"/></svg>`,
  },
  {
    id: "chat",
    label: "Mensagem",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#e2e8f0" d="M8 12h48c2 0 4 2 4 4v24c0 2-2 4-4 4H22L12 52V44c-4 0-4-2-4-4V16c0-2 2-4 4-4z"/><circle cx="22" cy="28" r="3" fill="#64748b"/><circle cx="32" cy="28" r="3" fill="#64748b"/><circle cx="42" cy="28" r="3" fill="#64748b"/></svg>`,
  },
  {
    id: "sun",
    label: "Sol",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="14" fill="#fbbf24"/><path fill="#fbbf24" d="M32 4v8M32 52v8M4 32h8M52 32h8M12 12l6 6M46 46l6 6M52 12l-6 6M12 52l6-6"/></svg>`,
  },
  {
    id: "moon",
    label: "Lua",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#cbd5e1" d="M46 12a18 18 0 1 0 6 30 14 14 0 1 1-6-30z"/></svg>`,
  },
  {
    id: "leaf",
    label: "Folha",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#22c55e" d="M8 48c12-4 28-16 36-36 0 0 8 20-8 32s-24 8-28 4z"/><path fill="#166534" d="M8 48c8-2 16-4 24-8"/></svg>`,
  },
  {
    id: "trophy",
    label: "Troféu",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#eab308" d="M16 12h32v8H16z"/><path fill="#ca8a04" d="M20 20h24v20H20z"/><path fill="#a16207" d="M24 40h16v6H24z"/><path fill="#eab308" d="M8 16h8v8H8zM48 16h8v8h-8z"/></svg>`,
  },
];

/* ── Deteção de fontes do sistema ── */
type SysFont = { family: string; css: string };

/** Fontes comuns a verificar via canvas (sem necessidade de permissão). */
const SYSTEM_FONT_CANDIDATES = [
  // Windows
  "Arial", "Arial Black", "Arial Narrow", "Calibri", "Cambria",
  "Comic Sans MS", "Consolas", "Constantia", "Corbel", "Courier New",
  "Franklin Gothic Medium", "Garamond", "Georgia", "Impact",
  "Lucida Console", "Lucida Sans Unicode", "Palatino Linotype",
  "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana",
  // macOS / iOS
  "Baskerville", "Big Caslon", "Brush Script MT", "Futura",
  "Geneva", "Gill Sans", "Helvetica", "Helvetica Neue",
  "Hoefler Text", "Menlo", "Monaco", "Optima", "Palatino",
  // Linux
  "DejaVu Sans", "DejaVu Serif", "Liberation Sans",
  "Liberation Serif", "Noto Sans", "Ubuntu",
  // Pré-instaladas / web
  "Roboto", "Open Sans", "Lato", "Source Sans Pro",
];

/**
 * Testa quais fontes do `SYSTEM_FONT_CANDIDATES` estão disponíveis no browser
 * usando comparação de larguras de texto via canvas (sem permissão necessária).
 */
function detectSystemFonts(): SysFont[] {
  if (typeof document === "undefined") return [];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  const TEST = "mmmmmmmmmmlli";
  const SIZE = 72;
  const bases = ["monospace", "sans-serif", "serif"] as const;
  const defaults = bases.map((b) => { ctx.font = `${SIZE}px ${b}`; return ctx.measureText(TEST).width; });
  return SYSTEM_FONT_CANDIDATES.filter((family) =>
    bases.some((b, i) => {
      ctx.font = `${SIZE}px '${family}', ${b}`;
      return ctx.measureText(TEST).width !== defaults[i];
    })
  ).map((family) => ({ family, css: `'${family}', sans-serif` }));
}

function fontCss(id: FontId | string): string {
  const found = FONTS.find((f) => f.id === id);
  if (found) return found.css;
  // Para fontes detetadas dinamicamente, o id é o próprio nome da família
  return `'${id}', sans-serif`;
}

function hexColor(v: string): string {
  return /^#[0-9a-f]{6}$/i.test((v ?? "").trim()) ? v.trim() : "#0f172a";
}

/* ── Renderização de texto curvo ── */
function drawCharStyled(
  ctx: CanvasRenderingContext2D,
  ch: string,
  fillStyle: string,
  strokeStyle: string,
  strokeWidth: number,
) {
  if (strokeWidth > 0 && strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = strokeWidth * 2;
    ctx.lineJoin = "round";
    ctx.strokeText(ch, 0, 0);
  }
  ctx.fillStyle = fillStyle;
  ctx.fillText(ch, 0, 0);
}

/** Emblema clássico — cada letra perpendicular ao raio (estilo vintage). */
function drawRadialArcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  radius: number,
  fillStyle: string,
  strokeStyle: string,
  strokeWidth: number,
  flip = false,
  letterSpacing = 0,
) {
  const chars = [...text.replace(/\n/g, " ")];
  if (!chars.length) return;
  const widths = chars.map((c) => ctx.measureText(c).width + letterSpacing);
  const totalAngle = widths.reduce((s, w) => s + w / radius, 0);

  if (!flip) {
    let angle = -totalAngle / 2;
    for (let i = 0; i < chars.length; i++) {
      const ca = widths[i]! / radius;
      ctx.save();
      ctx.rotate(angle + ca / 2);
      ctx.translate(0, -radius);
      drawCharStyled(ctx, chars[i]!, fillStyle, strokeStyle, strokeWidth);
      ctx.restore();
      angle += ca;
    }
  } else {
    let angle = Math.PI + totalAngle / 2;
    for (let i = 0; i < chars.length; i++) {
      const ca = widths[i]! / radius;
      ctx.save();
      ctx.rotate(angle - ca / 2);
      ctx.translate(0, -radius);
      ctx.rotate(Math.PI);
      drawCharStyled(ctx, chars[i]!, fillStyle, strokeStyle, strokeWidth);
      ctx.restore();
      angle -= ca;
    }
  }
}

/**
 * Arco moderno — letras verticais com inclinação suave (desporto / streetwear).
 */
function drawUprightArcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  radius: number,
  fillStyle: string,
  strokeStyle: string,
  strokeWidth: number,
  flip = false,
  letterSpacing = 0,
) {
  const chars = [...text.replace(/\n/g, " ")];
  if (!chars.length) return;
  const r = Math.max(radius, 40);
  const widths = chars.map((c) => ctx.measureText(c).width + letterSpacing);
  const totalAngle = widths.reduce((s, w) => s + w / r, 0);
  const maxTilt = Math.min(0.42, totalAngle * 0.22);

  let angle = -totalAngle / 2;
  for (let i = 0; i < chars.length; i++) {
    const ca = widths[i]! / r;
    const mid = angle + ca / 2;
    const x = Math.sin(mid) * r;
    const y = flip ? -r + Math.cos(mid) * r : r - Math.cos(mid) * r;
    const tilt = Math.sin(mid) * maxTilt * (flip ? -1 : 1);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    drawCharStyled(ctx, chars[i]!, fillStyle, strokeStyle, strokeWidth);
    ctx.restore();
    angle += ca;
  }
}

/** Onda sinusoidal — curva orgânica contemporânea. */
function drawWaveText(
  ctx: CanvasRenderingContext2D,
  text: string,
  radius: number,
  fillStyle: string,
  strokeStyle: string,
  strokeWidth: number,
  flip = false,
  letterSpacing = 0,
) {
  const chars = [...text.replace(/\n/g, " ")];
  if (!chars.length) return;
  const widths = chars.map((c) => ctx.measureText(c).width + letterSpacing);
  const totalW = widths.reduce((s, w) => s + w, 0);
  if (totalW <= 0) return;

  const intensity = (900 - Math.max(radius, 60)) / 840;
  const amplitude = 6 + intensity * 72;
  const sign = flip ? -1 : 1;
  let x = -totalW / 2;

  for (let i = 0; i < chars.length; i++) {
    const w = widths[i]!;
    const cx = x + w / 2;
    const t = (cx + totalW / 2) / totalW;
    const y = sign * amplitude * Math.sin(t * Math.PI);
    const dy = sign * amplitude * Math.cos(t * Math.PI) * (Math.PI / totalW);
    const rot = Math.atan2(dy, Math.max(w * 0.85, 1)) * 0.72;

    ctx.save();
    ctx.translate(cx, y);
    ctx.rotate(rot);
    drawCharStyled(ctx, chars[i]!, fillStyle, strokeStyle, strokeWidth);
    ctx.restore();
    x += w;
  }
}

function drawCurvedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  radius: number,
  fillStyle: string,
  strokeStyle: string,
  strokeWidth: number,
  flip = false,
  letterSpacing = 0,
  style: CurveStyle = "upright",
) {
  switch (style) {
    case "radial":
      drawRadialArcText(ctx, text, radius, fillStyle, strokeStyle, strokeWidth, flip, letterSpacing);
      break;
    case "wave":
      drawWaveText(ctx, text, radius, fillStyle, strokeStyle, strokeWidth, flip, letterSpacing);
      break;
    case "upright":
    default:
      drawUprightArcText(ctx, text, radius, fillStyle, strokeStyle, strokeWidth, flip, letterSpacing);
      break;
  }
}

/* ── Renderização de texto 3D (extrusão por camadas) ── */
function draw3dText(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  lh: number,
  oy: number,
  depth: number,
  depthColor: string,
  fillStyle: string,
  strokeStyle: string,
  strokeWidth: number,
) {
  // camadas traseiras — de trás para frente
  for (let d = depth; d >= 1; d--) {
    ctx.save();
    ctx.translate(d * 1.1, d * 1.1);
    ctx.fillStyle = depthColor;
    lines.forEach((line, i) => ctx.fillText(line, 0, oy + i * lh));
    ctx.restore();
  }
  // face frontal
  if (strokeWidth > 0 && strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = strokeWidth * 2;
    ctx.lineJoin = "round";
    lines.forEach((line, i) => ctx.strokeText(line, 0, oy + i * lh));
  }
  ctx.fillStyle = fillStyle;
  lines.forEach((line, i) => ctx.fillText(line, 0, oy + i * lh));
}

function isRaster(f: OrderModelagemFile) {
  return f.mimeType === "image/png" || f.mimeType === "image/jpeg";
}

/**
 * Renderiza apenas as camadas de design (texto + imagens) num contexto 2D,
 * sem o fundo/foto da peça. Usado para o canvas de arte-isolada do MockupViewer2D.
 */
function renderLayersToCtx(
  ctx: CanvasRenderingContext2D,
  layers: AnyLayer[],
  W: number,
  imageCache: Map<string, HTMLImageElement>,
) {
  for (const layer of sortLayersByZ(layers as DesignLayer[])) {
    ctx.save();
    ctx.translate(layer.x * W, layer.y * W);
    ctx.rotate((layer.rotationDeg * Math.PI) / 180);
    ctx.scale(layer.scale, layer.scale);
    ctx.globalAlpha = (layer as AnyLayer & { opacity?: number }).opacity ?? 1;

    if (layer.kind === "text") {
      const tl = layer as TextLayerEx;
      const style = tl.italic ? "italic " : "";
      const weight = tl.bold ? "bold " : "";
      ctx.font = `${style}${weight}${tl.fontSize}px ${tl.fontFamily}`;
      ctx.textAlign = tl.textAlign ?? "center";
      ctx.textBaseline = "middle";
      // letter-spacing via propriedade CSS do canvas (Chrome 99+, Firefox 116+, Safari 17.2+)
      type CtxEx = CanvasRenderingContext2D & { letterSpacing?: string };
      (ctx as CtxEx).letterSpacing = `${tl.letterSpacing ?? 0}px`;

      if (tl.textEffect === "curved") {
        ctx.textAlign = "center"; // texto curvo é sempre centrado no arco
        drawCurvedText(
          ctx,
          tl.text,
          tl.curveRadius,
          tl.color,
          tl.strokeColor,
          tl.strokeWidth,
          tl.curveFlip,
          tl.letterSpacing ?? 0,
          tl.curveStyle ?? "radial",
        );
      } else if (tl.textEffect === "3d") {
        const lines = tl.text.split("\n");
        const lh = tl.fontSize * 1.15;
        const oy = (-(lines.length - 1) * lh) / 2;
        draw3dText(ctx, lines, lh, oy, tl.depth3d, tl.depthColor, tl.color, tl.strokeColor, tl.strokeWidth);
      } else {
        const lines = tl.text.split("\n");
        const lh = tl.fontSize * 1.15;
        const oy = (-(lines.length - 1) * lh) / 2;
        if (tl.strokeWidth > 0 && tl.strokeColor) {
          ctx.strokeStyle = tl.strokeColor;
          ctx.lineWidth = tl.strokeWidth * 2;
          ctx.lineJoin = "round";
          lines.forEach((line, i) => ctx.strokeText(line, 0, oy + i * lh));
        }
        ctx.fillStyle = tl.color;
        lines.forEach((line, i) => ctx.fillText(line, 0, oy + i * lh));
      }
      (ctx as CtxEx).letterSpacing = "0px"; // reset para camadas seguintes
    } else {
      const il = layer as ImageLayerEx;
      const img = imageCache.get(il.id);
      if (img?.complete && img.naturalWidth) {
        const dw = il.widthRel * W;
        const dh = dw / il.aspect;
        if (il.flipX) ctx.scale(-1, 1);
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      }
    }
    ctx.restore();
  }
}

/**
 * Remove o fundo de uma imagem usando flood-fill a partir dos 4 cantos.
 * Funciona melhor com fundos sólidos ou quase-sólidos (branco, preto, etc.).
 * Retorna um novo blob URL com fundo transparente (PNG).
 */
async function removeImageBackground(srcUrl: string, tolerance = 30): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) { reject(new Error("Imagem inválida")); return; }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, w, h);
      const px = imageData.data; // Uint8ClampedArray, stride = 4

      /* Amostra a cor de fundo a partir dos 4 cantos */
      function sample(idx: number): [number, number, number] {
        const i = idx * 4;
        return [px[i]!, px[i + 1]!, px[i + 2]!];
      }
      const corners = [0, w - 1, (h - 1) * w, (h - 1) * w + w - 1].map(sample);
      /* Usa o canto com maior alpha (menos transparente) como referência */
      const bgIdx = [0, w - 1, (h - 1) * w, (h - 1) * w + w - 1].reduce(
        (best, c, i) => (px[c * 4 + 3]! >= px[best * 4 + 3]! ? i : best), 0,
      );
      const [bgR, bgG, bgB] = corners[bgIdx]!;

      function colorDiff(pixelIdx: number): number {
        const i = pixelIdx * 4;
        return Math.max(
          Math.abs(px[i]! - bgR!),
          Math.abs(px[i + 1]! - bgG!),
          Math.abs(px[i + 2]! - bgB!),
        );
      }

      /* Flood-fill iterativo (pilha) a partir dos 4 cantos */
      const visited = new Uint8Array(w * h);
      const stack: number[] = [0, w - 1, (h - 1) * w, (h - 1) * w + w - 1];

      while (stack.length > 0) {
        const idx = stack.pop()!;
        if (idx < 0 || idx >= w * h || visited[idx]) continue;
        visited[idx] = 1;
        if (colorDiff(idx) > tolerance) continue;
        px[idx * 4 + 3] = 0; // tornar transparente
        const x = idx % w;
        const y = Math.floor(idx / w);
        if (x > 0) stack.push(idx - 1);
        if (x < w - 1) stack.push(idx + 1);
        if (y > 0) stack.push(idx - w);
        if (y < h - 1) stack.push(idx + w);
      }

      /* Suavização de borda: semi-transparentes próximos do fundo ficam transparentes */
      for (let i = 0; i < w * h; i++) {
        if (visited[i] || px[i * 4 + 3]! === 0) continue;
        if (colorDiff(i) <= tolerance + 20 && px[i * 4 + 3]! > 180) {
          const diff = colorDiff(i);
          if (diff <= tolerance + 20) px[i * 4 + 3] = Math.round(px[i * 4 + 3]! * (diff - tolerance) / 20);
        }
      }

      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(URL.createObjectURL(blob));
          else reject(new Error("Falha ao gerar PNG"));
        },
        "image/png",
      );
    };
    img.onerror = () => reject(new Error("Não foi possível carregar a imagem"));
    img.src = srcUrl;
  });
}

/* ── Modal de recorte de imagem ── */
type CropHandle = "body" | "tl" | "tr" | "bl" | "br";
interface CropRect { x: number; y: number; w: number; h: number }

function ImageCropModal({
  src,
  onApply,
  onClose,
}: {
  src: string;
  onApply: (newSrc: string, newAspect: number) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [crop, setCrop] = useState<CropRect>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const [applying, setApplying] = useState(false);
  const dragRef = useRef<{
    handle: CropHandle;
    startMx: number; startMy: number;
    startCrop: CropRect;
  } | null>(null);

  const MIN = 0.04;

  function startDrag(handle: CropHandle, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = containerRef.current!.getBoundingClientRect();
    dragRef.current = {
      handle,
      startMx: (e.clientX - rect.left) / rect.width,
      startMy: (e.clientY - rect.top) / rect.height,
      startCrop: { ...crop },
    };
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = (e.clientX - rect.left) / rect.width - d.startMx;
      const dy = (e.clientY - rect.top) / rect.height - d.startMy;
      const s = d.startCrop;
      setCrop(() => {
        let { x, y, w, h } = s;
        switch (d.handle) {
          case "body":
            x = Math.max(0, Math.min(1 - w, s.x + dx));
            y = Math.max(0, Math.min(1 - h, s.y + dy));
            break;
          case "tl": {
            const nx = Math.max(0, Math.min(s.x + s.w - MIN, s.x + dx));
            const ny = Math.max(0, Math.min(s.y + s.h - MIN, s.y + dy));
            w = s.w + (s.x - nx); h = s.h + (s.y - ny);
            x = nx; y = ny;
            break;
          }
          case "tr": {
            const ny = Math.max(0, Math.min(s.y + s.h - MIN, s.y + dy));
            h = s.h + (s.y - ny); y = ny;
            w = Math.min(1 - s.x, Math.max(MIN, s.w + dx));
            break;
          }
          case "bl": {
            const nx = Math.max(0, Math.min(s.x + s.w - MIN, s.x + dx));
            w = s.w + (s.x - nx); x = nx;
            h = Math.min(1 - s.y, Math.max(MIN, s.h + dy));
            break;
          }
          case "br":
            w = Math.min(1 - x, Math.max(MIN, s.w + dx));
            h = Math.min(1 - y, Math.max(MIN, s.h + dy));
            break;
        }
        return { x, y, w, h };
      });
    }
    function onUp() { dragRef.current = null; }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const applyCrop = useCallback(async () => {
    setApplying(true);
    try {
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = src; });
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const cx = Math.round(crop.x * iw);
      const cy = Math.round(crop.y * ih);
      const cw = Math.max(1, Math.round(crop.w * iw));
      const ch = Math.max(1, Math.round(crop.h * ih));
      const out = document.createElement("canvas");
      out.width = cw; out.height = ch;
      out.getContext("2d")!.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
      out.toBlob((blob) => {
        if (blob) onApply(URL.createObjectURL(blob), cw / ch);
      }, "image/png");
    } catch { setApplying(false); }
  }, [crop, src, onApply]);

  const corners: [CropHandle, string, string][] = [
    ["tl", "top-0 left-0 -translate-x-1/2 -translate-y-1/2", "cursor-nwse-resize"],
    ["tr", "top-0 right-0 translate-x-1/2 -translate-y-1/2", "cursor-nesw-resize"],
    ["bl", "bottom-0 left-0 -translate-x-1/2 translate-y-1/2", "cursor-nesw-resize"],
    ["br", "bottom-0 right-0 translate-x-1/2 translate-y-1/2", "cursor-nwse-resize"],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-[min(92vw,680px)] max-h-[95vh] flex-col rounded-2xl border border-white/[0.07] bg-zinc-950 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* cabeçalho */}
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Recortar imagem</p>
            <p className="text-[11px] text-zinc-500">Arraste os cantos para definir a área de corte</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* imagem + overlay de recorte */}
        <div
          className="flex justify-center overflow-hidden rounded-xl"
          style={{ backgroundImage: "conic-gradient(#334155 25%,#1e293b 0 50%,#334155 0 75%,#1e293b 0)", backgroundSize: "16px 16px" }}
        >
          <div ref={containerRef} className="relative touch-none select-none" style={{ touchAction: "none" }}>
            <img src={src} alt="" className="block max-h-[58vh] max-w-full" draggable={false} />

            {/* máscaras escuras fora do recorte */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-0 top-0 bg-black/65" style={{ height: `${crop.y * 100}%` }} />
              <div className="absolute inset-x-0 bottom-0 bg-black/65" style={{ height: `${(1 - crop.y - crop.h) * 100}%` }} />
              <div className="absolute bg-black/65" style={{ top: `${crop.y * 100}%`, left: 0, width: `${crop.x * 100}%`, height: `${crop.h * 100}%` }} />
              <div className="absolute bg-black/65" style={{ top: `${crop.y * 100}%`, right: 0, width: `${(1 - crop.x - crop.w) * 100}%`, height: `${crop.h * 100}%` }} />
            </div>

            {/* caixa de recorte */}
            <div
              className="absolute cursor-move border border-white/80 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
              style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
              onPointerDown={(e) => startDrag("body", e)}
            >
              {/* grade de terços */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute left-1/3 top-0 h-full w-px bg-white/20" />
                <div className="absolute left-2/3 top-0 h-full w-px bg-white/20" />
                <div className="absolute top-1/3 left-0 h-px w-full bg-white/20" />
                <div className="absolute top-2/3 left-0 h-px w-full bg-white/20" />
              </div>

              {/* cantos de arraste — ≥44px para toque */}
              {corners.map(([handle, pos, cur]) => (
                <div
                  key={handle}
                  className={`absolute flex h-11 w-11 items-center justify-center ${pos} ${cur}`}
                  onPointerDown={(e) => startDrag(handle, e)}
                >
                  <span className="h-[18px] w-[18px] rounded-sm bg-white shadow-md" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* rodapé */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-500 tabular-nums">
            Área: {Math.round(crop.w * 100)}% × {Math.round(crop.h * 100)}%
            &nbsp;·&nbsp;
            Posição: {Math.round(crop.x * 100)}%, {Math.round(crop.y * 100)}%
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl border border-zinc-600/50 bg-zinc-800/40 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={applying}
              onClick={applyCrop}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:opacity-60"
            >
              {applying && <span className="h-3 w-3 animate-spin rounded-full border border-zinc-800/40 border-t-zinc-900" />}
              {applying ? "A processar…" : "Aplicar corte"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Componente principal ── */
export default function ContaPedidoModelagemPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  /* Pedido */
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Ficheiros do pedido */
  const [files, setFiles] = useState<OrderModelagemFile[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Layout adaptativo por dispositivo ──────────────────────────────────────
   * Mede o viewport e a altura real da navbar para calcular as configurações
   * correctas em cada ecrã: telemóvel pequeno, grande, tablet ou desktop.
   * ───────────────────────────────────────────────────────────────────────── */
  const [deviceLayout, setDeviceLayout] = useState<{
    /** true apenas abaixo de SM (640 px) — acima disso o layout fica lado-a-lado */
    isPhone: boolean;
    navbarH: number;       // altura real da navbar sticky (px)
    mockupH: number;       // altura do mockup em modo empilhado (px)
    panelMinH: number;     // altura mínima do painel de edição (px)
    deviceType: "phone-sm" | "phone-lg" | "tablet" | "desktop";
  }>({ isPhone: false, navbarH: 0, mockupH: 280, panelMinH: 420, deviceType: "desktop" });

  useEffect(() => {
    const compute = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      /* Medir altura real da navbar (primeiro <header> sticky) */
      const navEl = document.querySelector("header");
      const navbarH = navEl ? Math.round(navEl.getBoundingClientRect().height) : 0;

      /*
       * Alinha com o breakpoint Tailwind `sm` (640 px):
       *   < 640 px → telemóvel (layout empilhado + sticky mockup)
       *   ≥ 640 px → PC / tablet → layout lado-a-lado (`sm:grid-cols-…`)
       */
      const isPhone = vw < 640;

      let deviceType: typeof deviceLayout.deviceType;
      if (vw < 480)        deviceType = "phone-sm";
      else if (vw < 640)   deviceType = "phone-lg";
      else if (vw < 1024)  deviceType = "tablet";
      else                 deviceType = "desktop";

      /*
       * Telemóvel: mockup compacto o suficiente para o painel de edição
       * ficar visível de imediato (barra de acções ~72 px + cabeçalho compacto).
       */
      const ACTION_BAR_H = 72;
      const COMPACT_HEADER_H = 48;
      const usable = Math.max(0, vh - navbarH);
      const mockupH = isPhone
        ? Math.round(Math.min(Math.max(usable * 0.40, 220), usable * 0.46))
        : 0;
      const panelMinH = isPhone
        ? Math.max(280, vh - navbarH - mockupH - COMPACT_HEADER_H - ACTION_BAR_H)
        : 420;

      setDeviceLayout({ isPhone, navbarH, mockupH, panelMinH, deviceType });
    };

    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Camadas de edição */
  const [layers, setLayers] = useState<AnyLayer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSide, setActiveSide] = useState<"front" | "back">("front");
  const [bumpRedraw, setBumpRedraw] = useState(0);
  const [sysFonts, setSysFonts] = useState<SysFont[]>([]);
  /** Incrementa depois de cada redraw — usado como versão pelo MockupViewer2D */
  const [drawVersion, setDrawVersion] = useState(0);
  /** Canvas que contém apenas as camadas de arte (sem fundo da peça) — para o mockup 2D */
  const artOnlyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Ref para o MockupViewer2D — permite aceder ao canvas de saída no export */
  const mockupRef = useRef<MockupViewer2DHandle>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const blobUrlsRef = useRef<Set<string>>(new Set());

  /* Histórico de ações (undo / redo) */
  const layersRef = useRef<AnyLayer[]>([]);                 // espelho sempre-atual de `layers`
  const selectedIdRef = useRef<string | null>(null);        // espelho de selectedId para callbacks estáveis
  const historyRef = useRef<AnyLayer[][]>([]);              // estados passados
  const futureRef = useRef<AnyLayer[][]>([]);               // estados futuros (após undo)
  const [historyLen, setHistoryLen] = useState(0);
  const [futureLen, setFutureLen] = useState(0);
  const patchHistoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patchHistorySnapshotRef = useRef<AnyLayer[] | null>(null); // snapshot antes da primeira edição contínua

  /* Remoção de fundo */
  const [removingBgId, setRemovingBgId] = useState<string | null>(null);
  const [removeBgErr, setRemoveBgErr] = useState<string | null>(null);
  const [bgTolerance, setBgTolerance] = useState(30);

  /* Recorte */
  const [cropLayerId, setCropLayerId] = useState<string | null>(null);

  /* Upload drag-over */
  const [dragOver, setDragOver] = useState(false);

  const [layerDragId, setLayerDragId] = useState<string | null>(null);
  const [layerDragOverId, setLayerDragOverId] = useState<string | null>(null);

  /* Modelos prontos */
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  /** Painel Stickers e emoji — recolhido por defeito; preferência guardada na sessão. */
  const [stickersEmojiPanelOpen, setStickersEmojiPanelOpen] = useState(false);
  const [stickersPanelHydrated, setStickersPanelHydrated] = useState(false);

  /* Guardar como template (admin/designer) */
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [saveTemplateTitle, setSaveTemplateTitle] = useState("");
  const [saveTemplateCategory, setSaveTemplateCategory] = useState<DesignTemplateCategory>("OUTROS");
  const [saveTemplateBusy, setSaveTemplateBusy] = useState(false);
  const [saveTemplateErr, setSaveTemplateErr] = useState<string | null>(null);
  const [saveTemplateOk, setSaveTemplateOk] = useState(false);

  /* Guardar rascunho */
  const [saveDraftBusy, setSaveDraftBusy] = useState(false);
  const [saveDraftOk, setSaveDraftOk] = useState<string | null>(null);
  const [saveDraftErr, setSaveDraftErr] = useState<string | null>(null);

  /* Submeter pedido */
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitPreviewUrl, setSubmitPreviewUrl] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);
  const [sidePanelTab, setSidePanelTab] = useState<ModelagemSidePanelTab>("add");
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);
  const [fingerprintReady, setFingerprintReady] = useState(false);
  const [autoSaveLabel, setAutoSaveLabel] = useState<string | null>(null);
  const saveDraftRef = useRef<(opts?: { silent?: boolean }) => Promise<void>>(async () => {});
  const fingerprintOrderRef = useRef<string | null>(null);

  const modelagemPreview = useMemo(
    () => resolveModelagemPreviewFromOrder(order?.items),
    [order],
  );

  /* Papel do utilizador — usado para funcionalidades de admin/designer */
  const userRole = useMemo(() => loadSession()?.user.role ?? "", []);
  const viewerUserId = useMemo(() => loadSession()?.user.id ?? "", []);
  const isStaff = userRole === "ADMIN" || userRole === "DESIGNER";

  /** Admin e atendente no PDV: mesma saída da modelagem → passo 3 (pagamento) no balcão. */
  const isPdvBalcaoModelagem = useMemo(
    () =>
      (userRole === "ATTENDANT" || userRole === "ADMIN") &&
      order?.orderOrigin === "BALCAO",
    [userRole, order?.orderOrigin],
  );

  /**
   * Cliente: em pedido online, só edita em rascunho; em pedido de balcão, só consulta.
   * Staff pode continuar a editar conforme permissões da API.
   */
  const clientModelagemReadOnly = useMemo(
    () =>
      !isStaff &&
      userRole === "CLIENT" &&
      order != null &&
      (order.status !== "DRAFT" || orderIsBalcao(order)),
    [isStaff, userRole, order],
  );

  /** Mesma lógica do canvas: cliente só altera especificações em rascunho online. */
  const specsModelagemCanEdit = useMemo(
    () => userRole !== "CLIENT" || !clientModelagemReadOnly,
    [userRole, clientModelagemReadOnly],
  );

  const isClientOnlineDraft = useMemo(
    () =>
      userRole === "CLIENT" &&
      order?.status === "DRAFT" &&
      order != null &&
      !orderIsBalcao(order),
    [userRole, order],
  );

  const isDirty = useMemo(
    () =>
      !clientModelagemReadOnly &&
      fingerprintReady &&
      modelagemLayersDirty(layers, savedFingerprint),
    [clientModelagemReadOnly, fingerprintReady, layers, savedFingerprint],
  );

  const selected = layers.find((l) => l.id === selectedId) ?? null;

  /** Camadas visíveis no lado activo (para lista + painel + drag) */
  const activeLayers = layers.filter(
    (l) => !("side" in l) || (l as AnyLayer & { side: string }).side === activeSide,
  );

  const mockupDraggableLayers = useMemo(
    () =>
      activeLayers.map((l) => {
        const locked = clientModelagemReadOnly;
        if (l.kind === "text") {
          const t = l as TextLayerEx;
          return {
            id: t.id,
            kind: "text" as const,
            x: t.x,
            y: t.y,
            scale: t.scale,
            rotationDeg: t.rotationDeg,
            zIndex: t.zIndex,
            fontSize: t.fontSize,
            text: t.text,
            locked,
          };
        }
        const im = l as ImageLayerEx;
        return {
          id: im.id,
          kind: "image" as const,
          x: im.x,
          y: im.y,
          scale: im.scale,
          rotationDeg: im.rotationDeg,
          zIndex: im.zIndex,
          widthRel: im.widthRel,
          aspect: im.aspect,
          locked,
        };
      }),
    [activeLayers, clientModelagemReadOnly],
  );

  const selectedLayerLabel = selected
    ? selected.kind === "text"
      ? ((selected as TextLayerEx).text.trim().slice(0, 28) || "Texto")
      : ((selected as ImageLayerEx).name?.replace(/\.[^.]+$/, "").slice(0, 28) ?? "Imagem")
    : undefined;

  // manter refs sincronizadas para que callbacks possam ler os valores actuais sem dependências
  layersRef.current = layers;
  selectedIdRef.current = selectedId;

  /* Limpar blob URLs ao desmontar */
  useEffect(() => {
    const blobUrls = blobUrlsRef.current;
    return () => {
      blobUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  /* Auto-dismiss sucesso */
  useEffect(() => {
    if (!saveDraftOk) return;
    const t = setTimeout(() => setSaveDraftOk(null), 6000);
    return () => clearTimeout(t);
  }, [saveDraftOk]);

  /* Restaurar estado do painel Stickers e emoji nesta sessão (evita gravar antes de ler) */
  useEffect(() => {
    try {
      setStickersEmojiPanelOpen(sessionStorage.getItem(STICKERS_EMOJI_PANEL_STORAGE_KEY) === "1");
    } catch {
      /* modo privado / quota */
    }
    setStickersPanelHydrated(true);
  }, []);

  useEffect(() => {
    if (!stickersPanelHydrated) return;
    try {
      sessionStorage.setItem(STICKERS_EMOJI_PANEL_STORAGE_KEY, stickersEmojiPanelOpen ? "1" : "0");
    } catch {
      /* ignorar */
    }
  }, [stickersEmojiPanelOpen, stickersPanelHydrated]);

  /* Carregar imagens para cache quando aparecem novas camadas de imagem */
  useEffect(() => {
    const cache = imageCacheRef.current;
    const ids = new Set(layers.filter((l) => l.kind === "image").map((l) => l.id));
    for (const key of cache.keys()) if (!ids.has(key)) cache.delete(key);
    for (const layer of layers) {
      if (layer.kind !== "image" || cache.has(layer.id)) continue;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => setBumpRedraw((n) => n + 1);
      img.src = (layer as ImageDesignLayer).src;
      cache.set(layer.id, img);
    }
  }, [layers]);

  /* Actualiza só o canvas de arte isolada (lado activo) para o MockupViewer2D.
   * O PNG guardado no servidor NÃO deve empilhar frente+costas no mesmo espaço —
   * isso usar `composePersistedModelagemCanvas` (painéis Frente / Costas como no export). */
  const redraw = useCallback(() => {
    if (layers.length === 0) {
      const ac = artOnlyCanvasRef.current;
      if (ac) ac.getContext("2d")?.clearRect(0, 0, W, W);
      setDrawVersion((v) => v + 1);
      return;
    }

    const artCtx = artOnlyCanvasRef.current?.getContext("2d");
    if (artCtx) {
      artCtx.clearRect(0, 0, W, W);
      const sideLayers = layers.filter(
        (l) => !("side" in l) || (l as AnyLayer & { side: string }).side === activeSide,
      );
      renderLayersToCtx(artCtx, sideLayers, W, imageCacheRef.current);
    }

    setDrawVersion((v) => v + 1);
  }, [layers, activeSide]);

  useLayoutEffect(() => { redraw(); }, [redraw, bumpRedraw]);

  /* Ao mudar de lado, desseleciona camadas do outro lado e força redraw */
  useEffect(() => {
    setSelectedId((id) => {
      if (!id) return null;
      const layer = layersRef.current.find((l) => l.id === id);
      if (!layer) return null;
      const s = (layer as AnyLayer & { side?: string }).side;
      return (!s || s === activeSide) ? id : null;
    });
    setBumpRedraw((v) => v + 1);
  }, [activeSide]);

  /* API */
  const loadOrder = useCallback(async () => {
    if (!id) return;
    if (!loadSession()?.user) { router.replace(ROUTES.login); setLoading(false); return; }
    setError(null); setLoading(true);
    try { setOrder(await getOrder(id)); }
    catch (e) {
      const s = typeof e === "object" && e && "status" in e ? (e as ApiRequestError).status : undefined;
      if (s === 401) { router.replace(ROUTES.login); setLoading(false); return; }
      setError(e instanceof Error ? e.message : "Não foi possível carregar o pedido.");
      setOrder(null);
    } finally { setLoading(false); }
  }, [id, router]);

  const loadFiles = useCallback(async () => {
    if (!id) return;
    if (!loadSession()?.user) { router.replace(ROUTES.login); return; }
    try { setFiles(await listOrderModelagemFiles(id)); }
    catch (e) {
      const s = typeof e === "object" && e && "status" in e ? (e as ApiRequestError).status : undefined;
      if (s === 401) { router.replace(ROUTES.login); return; }
      setFiles([]);
    }
  }, [id, router]);

  useEffect(() => {
    if (!id) return;
    if (!loadSession()?.user) { router.replace(ROUTES.login); return; }
    void loadOrder();
  }, [id, loadOrder, router]);

  useEffect(() => { if (id && order) void loadFiles(); }, [id, order, loadFiles]);

  useEffect(() => {
    if (!id || !order) return;
    void getUnreadCount(id)
      .then(setUnread)
      .catch(() => setUnread(0));
  }, [id, order?.updatedAt]);

  const refreshOrder = useCallback(async () => {
    if (!id) return;
    setRefreshing(true);
    try {
      setOrder(await getOrder(id));
    } catch {
      /* mantém estado actual */
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  /* Baseline de alterações por guardar (após carga / hidratação). */
  useEffect(() => {
    fingerprintOrderRef.current = null;
    setFingerprintReady(false);
    setSavedFingerprint(null);
  }, [order?.id]);

  useEffect(() => {
    if (!order || loading) return;
    if (fingerprintOrderRef.current === order.id) return;
    const expectsHydrate = order.artVersions?.some(
      (v) =>
        v.layersJson != null &&
        Array.isArray(v.layersJson) &&
        v.layersJson.length > 0,
    );
    if (expectsHydrate && layers.length === 0) return;
    setSavedFingerprint(modelagemLayersFingerprint(layers));
    setFingerprintReady(true);
    fingerprintOrderRef.current = order.id;
  }, [order, loading, layers, order?.artVersions]);

  useEffect(() => {
    if (selectedId) {
      setSidePanelTab("edit");
    }
  }, [selectedId]);

  useEffect(() => {
    if (!order) return;
    const role = loadSession()?.user.role ?? "";
    if (role === "ATTENDANT" && order.orderOrigin !== "BALCAO") {
      router.replace(ROUTES.admin.pedidos);
    }
  }, [order, router]);

  /** Cliente: só acede ao editor em rascunho online — restantes casos vão ao detalhe (arte via pré-visualização). */
  useEffect(() => {
    if (!order || !id) return;
    const role = loadSession()?.user.role ?? "";
    if (role !== "CLIENT") return;
    const readOnly =
      order.status !== "DRAFT" || orderIsBalcao(order);
    if (readOnly) {
      router.replace(contaPedidoPath(id));
    }
  }, [order, id, router]);

  /* Reaproveitar arte guardada como camadas editáveis (preferindo a versão mais recente com layersJson ). */
  useEffect(() => {
    if (!id || !order?.artVersions?.length) return;
    if (layersRef.current.length > 0) return;
    const sorted = [...order.artVersions].sort((a, b) => b.versionIndex - a.versionIndex);
    let raw: unknown = null;
    let sourceCreatorId: string | undefined;
    for (const v of sorted) {
      const lj = v.layersJson;
      if (lj != null && Array.isArray(lj) && lj.length > 0) {
        raw = lj;
        sourceCreatorId = v.createdBy?.id;
        break;
      }
    }
    if (raw == null) return;

    const role = loadSession()?.user.role ?? "";
    const markAllDesignerModel =
      role === "CLIENT" &&
      order.status === "SUBMITTED" &&
      !!sourceCreatorId &&
      sourceCreatorId !== order.client.id;

    void (async () => {
      const loaded = await hydrateDraftLayersFromJson(id, raw, { markAllDesignerModel });
      if (layersRef.current.length > 0) return;
      if (!loaded.length) return;
      setLayers(loaded);
      setBumpRedraw((n) => n + 1);
    })();
  }, [id, order]);

  /* ── Histórico ── */
  const MAX_HISTORY = 50;

  const pushHistory = useCallback((snapshot: AnyLayer[]) => {
    historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), snapshot];
    futureRef.current = [];
    setHistoryLen(historyRef.current.length);
    setFutureLen(0);
  }, []);

  const undo = useCallback(() => {
    if (clientModelagemReadOnly) return;
    if (!historyRef.current.length) return;
    // cancelar debounce de patch pendente
    if (patchHistoryTimerRef.current) { clearTimeout(patchHistoryTimerRef.current); patchHistoryTimerRef.current = null; }
    patchHistorySnapshotRef.current = null;
    const prev = historyRef.current[historyRef.current.length - 1]!;
    futureRef.current = [layersRef.current, ...futureRef.current.slice(0, MAX_HISTORY - 1)];
    historyRef.current = historyRef.current.slice(0, -1);
    setLayers(prev);
    setHistoryLen(historyRef.current.length);
    setFutureLen(futureRef.current.length);
  }, [clientModelagemReadOnly]);

  const redo = useCallback(() => {
    if (clientModelagemReadOnly) return;
    if (!futureRef.current.length) return;
    if (patchHistoryTimerRef.current) { clearTimeout(patchHistoryTimerRef.current); patchHistoryTimerRef.current = null; }
    patchHistorySnapshotRef.current = null;
    const next = futureRef.current[0]!;
    historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), layersRef.current];
    futureRef.current = futureRef.current.slice(1);
    setLayers(next);
    setHistoryLen(historyRef.current.length);
    setFutureLen(futureRef.current.length);
  }, [clientModelagemReadOnly]);

  /* Limpar timer de histórico ao desmontar */
  useEffect(() => {
    return () => {
      if (patchHistoryTimerRef.current) {
        clearTimeout(patchHistoryTimerRef.current);
        patchHistoryTimerRef.current = null;
      }
    };
  }, []);

  /* Carregar Google Fonts (uma única vez) para renderização consistente no canvas */
  useEffect(() => {
    if (document.getElementById("dadivago-gfonts")) return;

    const pc1 = document.createElement("link");
    pc1.rel = "preconnect";
    pc1.href = "https://fonts.googleapis.com";

    const pc2 = document.createElement("link");
    pc2.rel = "preconnect";
    pc2.href = "https://fonts.gstatic.com";
    (pc2 as HTMLLinkElement & { crossOrigin: string }).crossOrigin = "anonymous";

    const link = document.createElement("link");
    link.id = "dadivago-gfonts";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Dancing+Script:wght@400;700&family=Montserrat:ital,wght@0,400;0,700;1,400;1,700&family=Oswald:wght@400;700&family=Pacifico&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap";

    document.head.appendChild(pc1);
    document.head.appendChild(pc2);
    document.head.appendChild(link);

    // Forçar redraw do canvas assim que as fontes terminarem de carregar
    link.addEventListener("load", () => {
      void document.fonts.ready.then(() => setBumpRedraw((n) => n + 1));
    });
  }, []);

  /* ── Deteção de fontes instaladas no sistema (canvas, sem permissão) ── */
  useEffect(() => {
    const detected = detectSystemFonts();
    // Remove fontes que já constam em FONTS para não duplicar
    const knownCss = new Set<string>(FONTS.map((f) => f.css));
    setSysFonts(detected.filter((f) => !knownCss.has(f.css)));
  }, []);

  /* Atalhos de teclado: Ctrl+Z → undo, Ctrl+Y / Ctrl+Shift+Z → redo | ArrowKeys → nudge */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      // Desfazer / Refazer
      if (ctrl && !inInput) {
        if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
        if (e.key === "y" || (e.key === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
      }

      // Nudge: mover camada seleccionada 1 px (ou 10 px com Shift)
      const isArrow =
        e.key === "ArrowUp" || e.key === "ArrowDown" ||
        e.key === "ArrowLeft" || e.key === "ArrowRight";
      if (isArrow && !inInput) {
        const lid = selectedIdRef.current;
        if (!lid) return;
        if (clientModelagemReadOnly) return;
        e.preventDefault();
        // Guarda snapshot de undo apenas no primeiro keydown (não nos repetidos ao segurar a tecla)
        if (!e.repeat) pushHistory(layersRef.current);
        const step = (e.shiftKey ? 10 : 1) / W;
        setLayers((prev) =>
          prev.map((l): AnyLayer => {
            if (l.id !== lid) return l;
            switch (e.key) {
              case "ArrowUp":    return { ...l, y: Math.max(0, l.y - step) } as AnyLayer;
              case "ArrowDown":  return { ...l, y: Math.min(1, l.y + step) } as AnyLayer;
              case "ArrowLeft":  return { ...l, x: Math.max(0, l.x - step) } as AnyLayer;
              case "ArrowRight": return { ...l, x: Math.min(1, l.x + step) } as AnyLayer;
              default: return l;
            }
          }),
        );
      }

      // Delete / Backspace — apagar camada selecionada
      if ((e.key === "Delete" || e.key === "Backspace") && !inInput) {
        const lid = selectedIdRef.current;
        if (!lid) return;
        if (clientModelagemReadOnly) return;
        e.preventDefault();
        pushHistory(layersRef.current);
        setLayers((prev) => {
          const victim = prev.find((l) => l.id === lid);
          if (victim?.kind === "image") {
            const src = (victim as ImageDesignLayer).src;
            if (src.startsWith("blob:")) { URL.revokeObjectURL(src); blobUrlsRef.current.delete(src); }
          }
          return prev.filter((l) => l.id !== lid);
        });
        setSelectedId((s) => (s === lid ? null : s));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, pushHistory, clientModelagemReadOnly]);

  /* Gestão de camadas */
  /**
   * Move um layer directamente (sem debounce de undo) — usado pelo drag do MockupViewer2D.
   * O snapshot de undo é guardado por `startLayerDrag` antes do drag começar.
   */
  const moveLayer = useCallback((lid: string, x: number, y: number) => {
    if (clientModelagemReadOnly) return;
    setLayers((prev) => prev.map((l) => (l.id === lid ? ({ ...l, x, y } as AnyLayer) : l)));
  }, [clientModelagemReadOnly]);

  /** Pinch / rotação no mockup — sem debounce (histórico já guardado em startLayerDrag). */
  const transformLayer = useCallback((lid: string, patch: LayerTransformPatch) => {
    if (clientModelagemReadOnly) return;
    setLayers((prev) =>
      prev.map((l) => (l.id === lid ? ({ ...l, ...patch } as AnyLayer) : l)),
    );
  }, [clientModelagemReadOnly]);

  /** Chamado quando o drag começa no mockup — guarda snapshot de undo e selecciona o layer. */
  const startLayerDrag = useCallback((lid: string) => {
    if (clientModelagemReadOnly) return;
    pushHistory(layersRef.current);
    setSelectedId(lid);
  }, [pushHistory, clientModelagemReadOnly]);

  const patchLayer = useCallback((lid: string, patch: Partial<AnyLayer>) => {
    if (clientModelagemReadOnly) return;
    // guarda snapshot antes da primeira edição contínua (slider, textbox…)
    if (!patchHistorySnapshotRef.current) {
      patchHistorySnapshotRef.current = layersRef.current;
    }
    // debounce: após 700ms sem edições, confirma o snapshot no histórico
    if (patchHistoryTimerRef.current) clearTimeout(patchHistoryTimerRef.current);
    patchHistoryTimerRef.current = setTimeout(() => {
      if (patchHistorySnapshotRef.current) {
        pushHistory(patchHistorySnapshotRef.current);
        patchHistorySnapshotRef.current = null;
      }
    }, 700);
    setLayers((prev) => prev.map((l) => (l.id === lid ? ({ ...l, ...patch } as AnyLayer) : l)));
  }, [pushHistory, clientModelagemReadOnly]);

  const removeLayer = useCallback((lid: string) => {
    if (clientModelagemReadOnly) return;
    pushHistory(layersRef.current);
    setLayers((prev) => {
      const victim = prev.find((l) => l.id === lid);
      if (victim?.kind === "image") {
        const src = (victim as ImageDesignLayer).src;
        if (src.startsWith("blob:")) { URL.revokeObjectURL(src); blobUrlsRef.current.delete(src); }
      }
      return prev.filter((l) => l.id !== lid);
    });
    setSelectedId((s) => (s === lid ? null : s));
  }, [pushHistory, clientModelagemReadOnly]);

  const addText = useCallback(() => {
    if (clientModelagemReadOnly) return;
    pushHistory(layersRef.current);
    const layer: TextLayerEx = {
      kind: "text", id: randomClientId(), zIndex: 0,
      x: 0.5, y: 0.45, scale: 1, rotationDeg: 0,
      text: "O teu texto", color: "#ffffff",
      fontSize: 36, fontFamily: fontCss("sans"), bold: false, italic: false,
      opacity: 1, strokeColor: "", strokeWidth: 0,
      textEffect: "normal", curveRadius: 320, curveFlip: false, curveStyle: "upright" as CurveStyle, depth3d: 6, depthColor: "#1a0500",
      textAlign: "center", letterSpacing: 0,
      side: activeSide,
    };
    setLayers((prev) => { layer.zIndex = nextZIndex(prev as DesignLayer[]); return [...prev, layer]; });
    setSelectedId(layer.id);
  }, [pushHistory, activeSide, clientModelagemReadOnly]);

  /** Uma ou mais codepoints emoji como camada de texto (render colour via fonte emoji). */
  const addEmojiLayer = useCallback(
    (emoji: string) => {
      if (clientModelagemReadOnly) return;
      pushHistory(layersRef.current);
      const layer: TextLayerEx = {
        kind: "text",
        id: randomClientId(),
        zIndex: 0,
        x: 0.5,
        y: 0.48,
        scale: 1,
        rotationDeg: 0,
        text: emoji,
        color: "#ffffff",
        fontSize: 56,
        fontFamily: fontCss("emoji"),
        bold: false,
        italic: false,
        opacity: 1,
        strokeColor: "",
        strokeWidth: 0,
        textEffect: "normal",
        curveRadius: 320,
        curveFlip: false,
        curveStyle: "upright" as CurveStyle,
        depth3d: 6,
        depthColor: "#1a0500",
        textAlign: "center",
        letterSpacing: 0,
        side: activeSide,
      };
      setLayers((prev) => {
        layer.zIndex = nextZIndex(prev as DesignLayer[]);
        return [...prev, layer];
      });
      setSelectedId(layer.id);
    },
    [pushHistory, activeSide, clientModelagemReadOnly],
  );

  /** SVG inline como camada de imagem (sticker pré-definido). */
  const addStickerFromSvgMarkup = useCallback(
    (svgMarkup: string, label: string) => {
      if (clientModelagemReadOnly) return;
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
      const probe = new Image();
      probe.onload = () => {
        const aspect = probe.naturalWidth / Math.max(probe.naturalHeight, 1);
        const layer: ImageLayerEx = {
          kind: "image",
          id: randomClientId(),
          zIndex: 0,
          x: 0.5,
          y: 0.5,
          scale: 1,
          rotationDeg: 0,
          src: dataUrl,
          widthRel: 0.22,
          aspect,
          opacity: 1,
          flipX: false,
          name: `Sticker · ${label}`,
          side: activeSide,
        };
        pushHistory(layersRef.current);
        setLayers((prev) => {
          layer.zIndex = nextZIndex(prev as DesignLayer[]);
          return [...prev, layer];
        });
        setSelectedId(layer.id);
      };
      probe.src = dataUrl;
    },
    [pushHistory, activeSide, clientModelagemReadOnly],
  );

  /** Aplica um template: substitui as camadas actuais pelas do template (com novos IDs). */
  const applyTemplate = useCallback((layersJson: unknown, mode: ApplyMode) => {
    const rawInput: unknown[] = (() => {
      if (Array.isArray(layersJson)) return layersJson;
      if (typeof layersJson === "string") {
        try {
          const p = JSON.parse(layersJson) as unknown;
          return Array.isArray(p) ? p : [];
        } catch {
          return [];
        }
      }
      return [];
    })();

    const raw = rawInput as AnyLayer[];
    if (!raw.length) return;
    const role = loadSession()?.user.role ?? "";
    if (role === "CLIENT" && order?.status != null && order.status !== "DRAFT") {
      setSaveDraftErr(
        "Este pedido já não está em rascunho — a arte não pode ser alterada aqui.",
      );
      setShowTemplateModal(false);
      return;
    }
    pushHistory(layersRef.current);

    /** Ao «adicionar», coloca sempre no lado em edição para ser visível de imediato. */
    const targetSideForAdd = activeSide;

    /* Próximo zIndex disponível */
    const baseZ = mode === "add"
      ? (layersRef.current.reduce((m, l) => Math.max(m, l.zIndex), 0) + 1)
      : 1;

    let zCounter = baseZ;
    const importedLayers: AnyLayer[] = [];

    const layerKind = (r: unknown) =>
      typeof (r as AnyLayer)?.kind === "string"
        ? (r as AnyLayer).kind.toLowerCase()
        : "";

    for (const r of raw) {
      const k = layerKind(r);
      if (k === "text") {
        const t = r as TextLayerEx;
        importedLayers.push({
          ...t,
          id: randomClientId(),
          zIndex: zCounter++,
          fontFamily: t.fontFamily || fontCss("sans"),
          bold: t.bold ?? false,
          italic: t.italic ?? false,
          opacity: t.opacity ?? 1,
          strokeColor: t.strokeColor ?? "",
          strokeWidth: t.strokeWidth ?? 0,
          textEffect: t.textEffect ?? "normal",
          curveRadius: t.curveRadius ?? 320,
          curveFlip: t.curveFlip ?? false,
          curveStyle:
            t.curveStyle ??
            (t.textEffect === "curved" ? "radial" : "upright"),
          depth3d: t.depth3d ?? 6,
          depthColor: t.depthColor ?? "#1a0500",
          textAlign: t.textAlign ?? "center",
          letterSpacing: t.letterSpacing ?? 0,
          side:
            mode === "add"
              ? targetSideForAdd
              : (t.side ?? "front"),
          designerModel: true,
        } as TextLayerEx);
      } else if (k === "image") {
        const img = r as ImageLayerEx;
        /* Blob URLs são específicos da sessão — ignorar */
        if (!img.src || img.src.startsWith("blob:")) continue;
        importedLayers.push({
          ...img,
          id: randomClientId(),
          zIndex: zCounter++,
          opacity: img.opacity ?? 1,
          flipX: img.flipX ?? false,
          side:
            mode === "add"
              ? targetSideForAdd
              : (img.side ?? "front"),
          designerModel: true,
        } as ImageLayerEx);
      }
    }

    if (!importedLayers.length) return;

    if (mode === "replace") {
      /* Revogar blobs actuais */
      for (const l of layersRef.current) {
        if (l.kind === "image") {
          const s = (l as ImageLayerEx).src;
          if (s?.startsWith("blob:")) { URL.revokeObjectURL(s); blobUrlsRef.current.delete(s); }
        }
      }
      setLayers(importedLayers);
    } else {
      /* Adicionar ao design existente */
      setLayers((prev) => [...prev, ...importedLayers]);
    }

    setSelectedId(null);
    setBumpRedraw((n) => n + 1);
    setShowTemplateModal(false);
  }, [pushHistory, activeSide, order?.status]);
  const blobUrlToDataUrl = useCallback(async (blobUrl: string): Promise<string> => {
    const resp = await fetch(blobUrl);
    const blob = await resp.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }, []);

  const serializeLayersForDraftPersist = useCallback(
    async (oid: string | undefined, list: AnyLayer[]): Promise<unknown[]> => {
      const seq: unknown[] = [];
      for (const l of list) {
        if (l.kind === "text") {
          seq.push({ ...(l as TextLayerEx) });
          continue;
        }
        const img = l as ImageLayerEx;
        if (img.orderModelagemFileId && oid) {
          seq.push({
            ...img,
            src: "",
            orderModelagemFileId: img.orderModelagemFileId,
          });
          continue;
        }
        if (img.src?.startsWith("blob:")) {
          try {
            const dataUrl = await blobUrlToDataUrl(img.src);
            seq.push({ ...img, src: dataUrl });
          } catch {
            seq.push({ ...img });
          }
          continue;
        }
        seq.push({ ...img });
      }
      return seq;
    },
    [blobUrlToDataUrl],
  );

  async function hydrateDraftLayersFromJson(
    oid: string,
    raw: unknown,
    opts?: { markAllDesignerModel?: boolean },
  ): Promise<AnyLayer[]> {
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const out: AnyLayer[] = [];
    let zi = 0;
    const layerKindOf = (r: unknown) =>
      typeof (r as AnyLayer)?.kind === "string"
        ? (r as AnyLayer).kind.toLowerCase()
        : "";

    for (const r of raw) {
      const k = layerKindOf(r);
      const designerModel =
        opts?.markAllDesignerModel === true ||
        !!(r as { designerModel?: boolean }).designerModel;
      if (k === "text") {
        const t = r as TextLayerEx;
        out.push({
          ...t,
          id: randomClientId(),
          zIndex: zi++,
          fontFamily: t.fontFamily || fontCss("sans"),
          bold: t.bold ?? false,
          italic: t.italic ?? false,
          opacity: t.opacity ?? 1,
          strokeColor: t.strokeColor ?? "",
          strokeWidth: t.strokeWidth ?? 0,
          textEffect: t.textEffect ?? "normal",
          curveRadius: t.curveRadius ?? 320,
          curveFlip: t.curveFlip ?? false,
          curveStyle:
            t.curveStyle ??
            (t.textEffect === "curved" ? "radial" : "upright"),
          depth3d: t.depth3d ?? 6,
          depthColor: t.depthColor ?? "#1a0500",
          textAlign: t.textAlign ?? "center",
          letterSpacing: t.letterSpacing ?? 0,
          side: t.side ?? "front",
          designerModel,
        } as TextLayerEx);
        continue;
      }
      if (k === "image") {
        const meta = r as ImageLayerEx;
        let src = meta.src ?? "";
        if (meta.orderModelagemFileId) {
          try {
            const blob = await fetchOrderModelagemFileBlob(oid, meta.orderModelagemFileId);
            const blobUrl = URL.createObjectURL(blob);
            blobUrlsRef.current.add(blobUrl);
            src = blobUrl;
          } catch {
            continue;
          }
        }
        if (!src) continue;
        out.push({
          ...meta,
          id: randomClientId(),
          zIndex: zi++,
          src,
          opacity: meta.opacity ?? 1,
          flipX: meta.flipX ?? false,
          side: meta.side ?? "front",
          orderModelagemFileId: meta.orderModelagemFileId,
          designerModel,
        } as ImageLayerEx);
      }
    }
    return out;
  }

  const handleSaveAsTemplate = useCallback(async () => {
    if (!saveTemplateTitle.trim()) { setSaveTemplateErr("O título é obrigatório."); return; }
    setSaveTemplateBusy(true);
    setSaveTemplateErr(null);
    try {
      /* Serializar camadas convertendo blob: URLs para base64 */
      const serialised = await Promise.all(
        layersRef.current.map(async (l): Promise<AnyLayer> => {
          if (l.kind === "image") {
            const img = l as ImageLayerEx;
            if (img.src?.startsWith("blob:")) {
              try {
                const dataUrl = await blobUrlToDataUrl(img.src);
                return { ...img, src: dataUrl };
              } catch {
                return img; /* mantém o blob: se falhar */
              }
            }
          }
          return l;
        }),
      );

      await createDesignTemplate({
        title: saveTemplateTitle.trim(),
        category: saveTemplateCategory,
        garmentType: modelagemPreview.productType || undefined,
        layersJson: serialised,
      });

      setSaveTemplateOk(true);
      setTimeout(() => {
        setShowSaveTemplateModal(false);
        setSaveTemplateOk(false);
        setSaveTemplateTitle("");
        setSaveTemplateCategory("OUTROS");
      }, 1500);
    } catch (e) {
      setSaveTemplateErr(e instanceof Error ? e.message : "Erro ao guardar template.");
    } finally {
      setSaveTemplateBusy(false);
    }
  }, [saveTemplateTitle, saveTemplateCategory, modelagemPreview.productType, blobUrlToDataUrl]);

  const addImageFromFile = useCallback(async (file: OrderModelagemFile) => {
    if (!isRaster(file) || !id) return;
    if (clientModelagemReadOnly) return;
    try {
      const blob = await fetchOrderModelagemFileBlob(id, file.id);
      const url = URL.createObjectURL(blob);
      blobUrlsRef.current.add(url);
      const probe = new Image();
      probe.onload = () => {
        const aspect = probe.naturalWidth / Math.max(probe.naturalHeight, 1);
        const layer: ImageLayerEx = {
          kind: "image", id: randomClientId(), zIndex: 0,
          x: 0.5, y: 0.5, scale: 1, rotationDeg: 0,
          src: url, widthRel: 0.5, aspect,
          opacity: 1, flipX: false,
          name: file.originalName,
          orderModelagemFileId: file.id,
          side: activeSide,
        };
        pushHistory(layersRef.current);
        setLayers((prev) => { layer.zIndex = nextZIndex(prev as DesignLayer[]); return [...prev, layer]; });
        setSelectedId(layer.id);
      };
      probe.src = url;
    } catch { /* ignorar */ }
  }, [id, pushHistory, activeSide, clientModelagemReadOnly]);

  const uploadFiles = useCallback(
    async (list: FileList | File[]) => {
      if (clientModelagemReadOnly) return;
      if (!list.length || !id) return;
      setUploadErr(null);
      setUploadBusy(true);
      try {
        for (let i = 0; i < list.length; i++) {
          const file = list[i]!;
          const created = await uploadOrderModelagemFile(id, file);
          if (isRaster(created)) {
            await addImageFromFile(created);
          }
        }
        await loadFiles();
      } catch (err) {
        setUploadErr(err instanceof Error ? err.message : "Upload falhou.");
      } finally {
        setUploadBusy(false);
      }
    },
    [id, loadFiles, addImageFromFile, clientModelagemReadOnly],
  );

  const onPickFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (list?.length) await uploadFiles(list);
    e.target.value = "";
  }, [uploadFiles]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type === "image/png" || f.type === "image/jpeg" || f.type === "image/svg+xml",
    );
    if (files.length) void uploadFiles(files);
  }, [uploadFiles]);

  /**
   * Composição gravada no servidor e mostrada ao designer: frente e costas em
   * painéis separados com rótulos (não empilhar ambas no mesmo mockup).
   */
  const composePersistedModelagemCanvas = useCallback((): HTMLCanvasElement | null => {
    const frontLayers = layersRef.current.filter(
      (l) =>
        !(l as AnyLayer & { side?: string }).side ||
        (l as AnyLayer & { side?: string }).side === "front",
    );
    const backLayers = layersRef.current.filter(
      (l) => (l as AnyLayer & { side?: string }).side === "back",
    );

    const makeSideArt = (sideLayers: AnyLayer[]): HTMLCanvasElement => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = W;
      const cx = c.getContext("2d")!;
      cx.clearRect(0, 0, W, W);
      if (sideLayers.length > 0) {
        renderLayersToCtx(cx, sideLayers, W, imageCacheRef.current);
      }
      return c;
    };

    const frontArt = makeSideArt(frontLayers);
    const backArt = makeSideArt(backLayers);

    const mv = mockupRef.current;
    const frontCanvas = mv?.renderSide("front", frontArt) ?? null;
    const backCanvas = mv?.renderSide("back", backArt) ?? null;
    if (!frontCanvas) return null;

    const mW = frontCanvas.width;
    const mH = frontCanvas.height;
    const hasBack = backLayers.length > 0 && !!backCanvas;

    const panelGap = Math.round(mW * 0.04);
    const sidePad = Math.round(mW * 0.03);
    const topPad = Math.round(mH * 0.06);
    const labelH = Math.round(mH * 0.07);
    const totalW = hasBack
      ? sidePad + mW + panelGap + mW + sidePad
      : sidePad + mW + sidePad;
    const totalH = topPad + labelH + mH + sidePad;

    const out = document.createElement("canvas");
    out.width = totalW;
    out.height = totalH;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#080c14";
    ctx.fillRect(0, 0, totalW, totalH);

    const labelFontSize = Math.round(mW * 0.038);
    ctx.font = `bold ${labelFontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const drawPanel = (mockupCanvas: HTMLCanvasElement, px: number, label: string) => {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillText(label, px + mW / 2, topPad + labelH / 2);
      ctx.drawImage(mockupCanvas, px, topPad + labelH, mW, mH);
    };

    drawPanel(frontCanvas, sidePad, "Frente");
    if (hasBack && backCanvas) {
      drawPanel(backCanvas, sidePad + mW + panelGap, "Costas");
    }

    return out;
  }, []);

  /* Exportar PNG — mesma composição gravada no servidor + marca d'água e selo */
  const exportPng = useCallback(() => {
    const composed = composePersistedModelagemCanvas();
    if (!composed) return;

    const totalW = composed.width;
    const totalH = composed.height;
    const out = document.createElement("canvas");
    out.width = totalW;
    out.height = totalH;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(composed, 0, 0);

    /* marca d'água diagonal */
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = "#ffffff";
    const step = Math.round(Math.min(totalW, totalH) * 0.22);
    const wmFontSize = Math.round(Math.min(totalW, totalH) * 0.03);
    ctx.font = `bold ${wmFontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(totalW / 2, totalH / 2);
    ctx.rotate(-Math.PI / 5);
    const cols = Math.ceil(totalW / step) + 4;
    const rows = Math.ceil(totalH / step) + 4;
    for (let row = -rows; row <= rows; row++) {
      for (let col = -cols; col <= cols; col++) {
        ctx.fillText("Dádiva Go", col * step, row * step);
      }
    }
    ctx.restore();

    /* selo de rodapé central */
    const badgeFontSize = Math.round(Math.min(totalW, totalH) * 0.024);
    const subFontSize = Math.round(badgeFontSize * 0.72);
    const lineH2 = badgeFontSize + 4;
    const badgeW = Math.round(totalW * 0.32);
    const badgeH = lineH2 + subFontSize + 10;
    const pad2 = Math.round(Math.min(totalW, totalH) * 0.018);
    const bx = (totalW - badgeW) / 2;
    const by = totalH - badgeH - pad2;
    const r = 8;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "rgba(10,10,10,0.75)";
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + badgeW - r, by);
    ctx.quadraticCurveTo(bx + badgeW, by, bx + badgeW, by + r);
    ctx.lineTo(bx + badgeW, by + badgeH - r);
    ctx.quadraticCurveTo(bx + badgeW, by + badgeH, bx + badgeW - r, by + badgeH);
    ctx.lineTo(bx + r, by + badgeH);
    ctx.quadraticCurveTo(bx, by + badgeH, bx, by + badgeH - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const bcx = bx + badgeW / 2;
    const mainY = by + badgeH / 2 - lineH2 / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${badgeFontSize}px sans-serif`;
    ctx.fillText("Dádiva Go", bcx, mainY);
    ctx.fillStyle = "rgba(255,255,255,0.50)";
    ctx.font = `${subFontSize}px sans-serif`;
    ctx.fillText("Arte protegida · dadivago.com.br", bcx, mainY + lineH2);
    ctx.restore();

    const a = document.createElement("a");
    a.download = `arte-${order?.orderNumber ?? "design"}.png`;
    a.href = out.toDataURL("image/png");
    a.click();
  }, [composePersistedModelagemCanvas, order?.orderNumber]);

  const especificacoesServidor = useMemo(
    () => parseModelagemSpecsFromOrder(order?.modelagemSpecs),
    [order?.modelagemSpecs],
  );
  const podeExportarSpecsServidor =
    modelagemSpecsHasExportableContent(especificacoesServidor);
  const numPedidoExport = order?.orderNumber ?? id ?? "pedido";

  const exportSpecsPdfSidebar = useCallback(() => {
    if (!podeExportarSpecsServidor) {
      setSaveDraftOk(null);
      setSaveDraftErr(
        "Não há especificações extra guardadas no pedido para exportar. Grave-as em «Informação extra de produção» antes.",
      );
      return;
    }
    void downloadModelagemSpecsPdf(especificacoesServidor, numPedidoExport);
    setSaveDraftErr(null);
    setSaveDraftOk("PDF das especificações guardadas descarregado.");
  }, [
    especificacoesServidor,
    numPedidoExport,
    podeExportarSpecsServidor,
  ]);

  const exportSpecsCsvSidebar = useCallback(() => {
    if (!podeExportarSpecsServidor) {
      setSaveDraftOk(null);
      setSaveDraftErr(
        "Não há especificações extra guardadas no pedido para exportar. Grave-as em «Informação extra de produção» antes.",
      );
      return;
    }
    void downloadModelagemSpecsExcelCsv(especificacoesServidor, numPedidoExport);
    setSaveDraftErr(null);
    setSaveDraftOk("Ficheiro Excel (CSV) das especificações guardadas descarregado.");
  }, [
    especificacoesServidor,
    numPedidoExport,
    podeExportarSpecsServidor,
  ]);

  /* Guardar rascunho */
  const saveDraft = useCallback(async (opts?: { silent?: boolean }) => {
    if (!id) return;
    if (clientModelagemReadOnly) {
      if (!opts?.silent) {
        setSaveDraftErr(
          "Só pode guardar alterações ao design enquanto o pedido está em rascunho.",
        );
      }
      return;
    }
    if (!loadSession()?.user) { router.replace(ROUTES.login); return; }
    if (!opts?.silent) {
      setSaveDraftOk(null);
      setSaveDraftErr(null);
    }
    setSaveDraftBusy(true);
    try {
      const composed = composePersistedModelagemCanvas();
      if (!composed || layers.length === 0) {
        if (!opts?.silent) {
          setSaveDraftErr(
            !composed
              ? "Não foi possível gerar a pré-visualização. Recarrega a página e tenta de novo."
              : "Adiciona pelo menos uma camada antes de guardar.",
          );
        }
        return;
      }
      const layersPayload = await serializeLayersForDraftPersist(id, layersRef.current);
      const row = await saveOrderModelagemComposition(
        id,
        composed.toDataURL("image/png"),
        layersPayload,
      );
      const fp = modelagemLayersFingerprint(layersRef.current);
      setSavedFingerprint(fp);
      fingerprintOrderRef.current = id;
      if (opts?.silent) {
        setAutoSaveLabel(
          `Guardado automaticamente · v${row.versionIndex}`,
        );
        setTimeout(() => setAutoSaveLabel(null), 5000);
      } else {
        setSaveDraftOk(`Versão ${row.versionIndex} guardada com sucesso.`);
        setAutoSaveLabel(null);
      }
      setOrder(await getOrder(id));
    } catch (e) {
      const s = typeof e === "object" && e && "status" in e ? (e as ApiRequestError).status : undefined;
      if (s === 401) { router.replace(ROUTES.login); return; }
      if (!opts?.silent) {
        setSaveDraftErr(e instanceof Error ? e.message : "Não foi possível guardar.");
      }
    } finally { setSaveDraftBusy(false); }
  }, [id, layers.length, router, composePersistedModelagemCanvas, clientModelagemReadOnly, serializeLayersForDraftPersist]);

  saveDraftRef.current = saveDraft;

  useEffect(() => {
    if (!isDirty || clientModelagemReadOnly || layers.length === 0 || saveDraftBusy) return;
    const t = setTimeout(() => {
      void saveDraftRef.current({ silent: true });
    }, 45_000);
    return () => clearTimeout(t);
  }, [isDirty, clientModelagemReadOnly, layers.length, saveDraftBusy, layers]);

  /** Admin / atendente PDV: guarda composição e volta ao balcão no passo 3 (pagamento), com o mesmo rascunho. */
  const continueToBalcaoPayment = useCallback(async () => {
    if (!id) return;
    if (!loadSession()?.user) {
      router.replace(ROUTES.login);
      return;
    }
    setSaveDraftOk(null);
    setSaveDraftErr(null);
    setSaveDraftBusy(true);
    try {
      const composed = composePersistedModelagemCanvas();
      if (!composed || layers.length === 0) {
        setSaveDraftErr(
          !composed
            ? "Não foi possível gerar a pré-visualização. Recarrega a página e tenta de novo."
            : "Adiciona pelo menos uma camada antes de continuar para o pagamento.",
        );
        return;
      }
      const layersPayload = await serializeLayersForDraftPersist(id, layersRef.current);
      await saveOrderModelagemComposition(
        id,
        composed.toDataURL("image/png"),
        layersPayload,
      );
      setOrder(await getOrder(id));
      router.push(
        `${ROUTES.admin.pedidoBalcao}?resume=${encodeURIComponent(id)}`,
      );
    } catch (e) {
      const s =
        typeof e === "object" && e && "status" in e
          ? (e as ApiRequestError).status
          : undefined;
      if (s === 401) {
        router.replace(ROUTES.login);
        return;
      }
      setSaveDraftErr(
        e instanceof Error ? e.message : "Não foi possível guardar antes de continuar.",
      );
    } finally {
      setSaveDraftBusy(false);
    }
  }, [
    id,
    layers.length,
    router,
    composePersistedModelagemCanvas,
    serializeLayersForDraftPersist,
  ]);

  /* Submeter pedido — abre modal com preview */
  const handleOpenSubmit = useCallback(async () => {
    if (!id) return;
    if (clientModelagemReadOnly) return;
    if (!loadSession()?.user) { router.replace(ROUTES.login); return; }
    const composed = composePersistedModelagemCanvas();
    if (!composed || layers.length === 0) {
      setSaveDraftErr(
        !composed
          ? "Não foi possível gerar a pré-visualização. Recarrega a página e tenta de novo."
          : "Adiciona e guarda pelo menos uma camada antes de submeter.",
      );
      return;
    }
    const dataUrl = composed.toDataURL("image/png");
    /* Guarda rascunho automaticamente antes de abrir o modal */
    setSaveDraftBusy(true); setSaveDraftOk(null); setSaveDraftErr(null);
    try {
      const layersPayload = await serializeLayersForDraftPersist(id, layersRef.current);
      await saveOrderModelagemComposition(id, dataUrl, layersPayload);
      const fp = modelagemLayersFingerprint(layersRef.current);
      setSavedFingerprint(fp);
      fingerprintOrderRef.current = id;
      setOrder(await getOrder(id));
    } catch (e) {
      const s = typeof e === "object" && e && "status" in e ? (e as ApiRequestError).status : undefined;
      if (s === 401) { router.replace(ROUTES.login); return; }
      setSaveDraftErr(e instanceof Error ? e.message : "Não foi possível guardar o rascunho.");
      return;
    } finally { setSaveDraftBusy(false); }

    setSubmitPreviewUrl(dataUrl);
    setShowSubmitModal(true);
  }, [id, layers.length, router, composePersistedModelagemCanvas, clientModelagemReadOnly, serializeLayersForDraftPersist]);

  const handleConfirmSubmit = useCallback(
    async (paymentMethod: PaymentMethodValue, proofFile?: File) => {
      if (!id) throw new Error("Pedido inválido.");
      return submitOrder(id, paymentMethod, proofFile);
    },
    [id],
  );

  const handleSubmitFinished = useCallback(
    async (detail: OrderDetail) => {
      const role = loadSession()?.user.role ?? "";
      const href = modelagemExitOverviewHref(role, id, {
        orderOrigin: detail.orderOrigin,
      });
      hardNavigateReplace(href);
    },
    [id],
  );

  const closeSubmitModal = useCallback(() => {
    setShowSubmitModal(false);
    setSubmitPreviewUrl(null);
  }, []);

  /* Duplicar camada (cópia deixa de contar como modelo do designer para poder editar) */
  const duplicateLayer = useCallback((lid: string) => {
    if (clientModelagemReadOnly) return;
    pushHistory(layersRef.current);
    setLayers((prev) => {
      const s = prev.find((l) => l.id === lid);
      if (!s) return prev;
      const copy = {
        ...s,
        id: randomClientId(),
        x: Math.min(0.95, s.x + 0.04),
        y: Math.min(0.95, s.y + 0.04),
        zIndex: nextZIndex(prev as DesignLayer[]),
        designerModel: false,
      } as AnyLayer;
      return [...prev, copy];
    });
  }, [pushHistory, clientModelagemReadOnly]);

  /**
   * Drag-and-drop: move `fromId` para a posição de `toId` na pilha de zIndex.
   * A lista é exibida do topo (frente) para baixo (fundo), por isso um índice
   * mais alto na lista → zIndex mais alto (mais à frente).
   */
  const reorderLayer = useCallback((fromId: string, toId: string) => {
    if (clientModelagemReadOnly) return;
    if (fromId === toId) return;
    pushHistory(layersRef.current);
    setLayers((prev) => {
      // Ordenado do mais alto zIndex (frente) para o mais baixo (fundo)
      const sorted = [...prev].sort((a, b) => b.zIndex - a.zIndex);
      const fromIdx = sorted.findIndex((l) => l.id === fromId);
      const toIdx   = sorted.findIndex((l) => l.id === toId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const newOrder = [...sorted];
      const [moved] = newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, moved!);
      // Reatribui zIndex consecutivos preservando a nova ordem
      const maxZ = newOrder.length - 1;
      return prev.map((l) => {
        const ni = newOrder.findIndex((n) => n.id === l.id);
        return { ...l, zIndex: maxZ - ni } as AnyLayer;
      });
    });
  }, [pushHistory, clientModelagemReadOnly]);

  /* Centrar camada */
  const centerLayer = useCallback((lid: string) => {
    patchLayer(lid, { x: 0.5, y: 0.5 });
  }, [patchLayer]);

  /* Remover fundo da imagem seleccionada */
  const removeBg = useCallback(async (layerId: string) => {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || layer.kind !== "image") return;
    if (clientModelagemReadOnly) return;
    const il = layer as ImageLayerEx;
    setRemovingBgId(layerId);
    setRemoveBgErr(null);
    pushHistory(layersRef.current);
    try {
      const newUrl = await removeImageBackground(il.src, bgTolerance);
      blobUrlsRef.current.add(newUrl);
      if (il.src.startsWith("blob:")) {
        URL.revokeObjectURL(il.src);
        blobUrlsRef.current.delete(il.src);
      }
      imageCacheRef.current.delete(layerId);
      patchLayer(layerId, { src: newUrl } as Partial<ImageLayerEx>);
      setBumpRedraw((n) => n + 1);
    } catch (e) {
      setRemoveBgErr(e instanceof Error ? e.message : "Não foi possível remover o fundo.");
      // desfaz o snapshot que foi colocado antes do erro
      historyRef.current = historyRef.current.slice(0, -1);
      setHistoryLen(historyRef.current.length);
    } finally {
      setRemovingBgId(null);
    }
  }, [layers, bgTolerance, patchLayer, pushHistory, clientModelagemReadOnly]);

  /* ── Guardas de navegação ── */
  if (!id) {
    router.replace(accountPedidosIndexHref(loadSession()?.user.role ?? ""));
    return null;
  }

  if (loading) return (
    <div className="mx-auto max-w-[1600px] space-y-3 pt-1">
      <div className="conta-skeleton-shimmer h-24 rounded-xl ring-1 ring-zinc-200/50 dark:ring-zinc-700/40" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_260px] lg:grid-cols-[minmax(0,1fr)_300px]">
        <div
          className="conta-skeleton-shimmer h-[min(720px,calc(100dvh-5rem))] min-h-[320px] rounded-2xl ring-1 ring-zinc-200/50 dark:ring-zinc-800/40 sm:min-h-[560px]"
          style={{ animationDelay: "80ms" }}
        />
        <div
          className="conta-skeleton-shimmer hidden h-[min(720px,calc(100dvh-5rem))] min-h-[320px] rounded-2xl ring-1 ring-zinc-200/40 dark:ring-zinc-800/30 sm:block sm:min-h-[560px]"
          style={{ animationDelay: "140ms" }}
        />
      </div>
    </div>
  );

  if (error || !order) return (
    <div className="conta-animate-scale-in space-y-5" style={{ "--conta-delay": "0ms" } as CSSProperties}>
      <Link
        href={accountPedidosIndexHref(loadSession()?.user.role ?? "")}
        className="inline-flex text-sm font-medium text-amber-700 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
      >
        {isStaffRole(loadSession()?.user.role ?? "")
          ? "← Voltar à área interna"
          : "← Voltar aos pedidos"}
      </Link>
      <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-4 text-sm text-red-100" role="alert">
        <p className="font-medium">{error ?? "Pedido não encontrado."}</p>
        <button type="button" onClick={() => void loadOrder()} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-400/30 bg-red-900/30 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-900/50">Tentar novamente</button>
      </div>
    </div>
  );

  const svgFiles = files.filter((f) => f.mimeType === "image/svg+xml");

  const exitLabel = isStaffRole(userRole)
    ? userRole === "DESIGNER"
      ? "Ferramentas de designer"
      : isPdvBalcaoModelagem
        ? "Voltar ao balcão"
        : "Pedidos (administração)"
    : "Voltar ao pedido";

  const exitHref = modelagemExitOverviewHref(userRole, order.id, {
    orderOrigin: order.orderOrigin,
  });

  const showSubmitBtn =
    order.status === "DRAFT" &&
    !isPdvBalcaoModelagem &&
    !(userRole === "CLIENT" && orderIsBalcao(order));

  const showBalcaoBtn =
    order.status === "DRAFT" && isPdvBalcaoModelagem;

  return (
    <div className="mx-auto max-w-[1600px] space-y-2 pb-28 pt-0 sm:space-y-3 sm:pb-8 sm:pt-1">

      <ModelagemPageHeader
        order={order}
        exitHref={exitHref}
        exitLabel={exitLabel}
        baseColorHex={modelagemPreview.baseColorHex}
        previewCaption={modelagemPreview.caption}
        showWizard={isClientOnlineDraft}
        unsaved={isDirty}
        refreshing={refreshing}
        onRefresh={() => void refreshOrder()}
        isClientOnlineDraft={isClientOnlineDraft}
        compact={deviceLayout.isPhone}
      />

      {/* ── Workspace: mockup + painel (prioridade visual — acima dos detalhes) ── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_260px] sm:gap-3 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px] sm:min-h-[min(760px,calc(100dvh-5rem))]">

        {/*
          * Mockup 2D fotorrealista
          * • Telemóvel (< 640 px) → sticky, ~40 % da altura útil (deixa o editor visível)
          * • ≥ 640 px             → preenche a altura útil do viewport
          */}
        <div
          className={`conta-animate-stagger conta-order-card relative min-h-[280px] overflow-hidden border border-zinc-200/80 shadow-[0_24px_48px_-28px_rgba(0,0,0,0.2)] ring-1 ring-inset ring-zinc-200/50 dark:border-white/[0.07] dark:shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)] dark:ring-white/[0.03] sm:min-h-[min(760px,calc(100dvh-5rem))] sm:h-[min(760px,calc(100dvh-5rem))] ${
            deviceLayout.isPhone
              ? "-mx-4 w-[calc(100%+2rem)] rounded-none border-x-0 bg-zinc-950"
              : "rounded-2xl bg-zinc-950/90"
          }`}
          style={{
            "--conta-i": 0,
            ...(deviceLayout.isPhone
              ? {
                  position: "sticky",
                  top: deviceLayout.navbarH,
                  zIndex: 10,
                  height: deviceLayout.mockupH,
                  minHeight: deviceLayout.mockupH,
                }
              : {}),
          } as CSSProperties}
        >
          {/* Canvas oculto de arte isolada (apenas camadas, sem fundo da peça) */}
          <canvas
            ref={artOnlyCanvasRef}
            width={W}
            height={W}
            className="sr-only"
            aria-hidden
          />

          <div
            className="h-full w-full"
          >
            <ProductMockupViewer
              ref={mockupRef}
              preview={modelagemPreview}
              artCanvasRef={artOnlyCanvasRef}
              drawVersion={drawVersion}
              showFooterHint={!deviceLayout.isPhone}
              layers={mockupDraggableLayers}
              onDragStart={startLayerDrag}
              onMoveLayer={moveLayer}
              onTransformLayer={transformLayer}
              onSelectLayer={setSelectedId}
              selectedId={selectedId}
              selectedLayerLabel={selectedLayerLabel}
              activeSide={activeSide}
              onSideChange={setActiveSide}
              touchFriendly={deviceLayout.isPhone}
              className="h-full w-full"
            />

            {activeLayers.length === 0 ? (
              <ModelagemEmptyState
                readOnly={clientModelagemReadOnly}
                onAddText={addText}
                onOpenTemplates={() => setShowTemplateModal(true)}
                onUploadClick={() => fileInputRef.current?.click()}
              />
            ) : null}
          </div>

        </div>

        {/* ── Painel de edição ── */}
        <div
          className={`conta-animate-stagger flex min-w-0 flex-col rounded-2xl border border-zinc-200/80 bg-white/60 ring-1 ring-zinc-200/40 dark:border-zinc-700/40 dark:bg-zinc-950/60 dark:ring-white/[0.03] sm:min-h-[min(760px,calc(100dvh-5rem))] sm:h-[min(760px,calc(100dvh-5rem))] ${
            deviceLayout.isPhone ? "" : "min-h-[min(420px,52dvh)]"
          }`}
          style={{
            "--conta-i": 1,
            ...(deviceLayout.isPhone
              ? { minHeight: deviceLayout.panelMinH }
              : {}),
          } as CSSProperties}
        >

          {/* Área scrollável — controlos, tabs, camadas */}
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3 pb-6 sm:p-4">

          {/* Barra de Undo / Redo */}
          <div className="flex items-center gap-1.5 rounded-xl border border-zinc-700/40 bg-zinc-900/50 px-2 py-1.5">
            <button
              type="button"
              disabled={historyLen === 0 || clientModelagemReadOnly}
              onClick={undo}
              title="Desfazer (Ctrl+Z)"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-700/40 bg-zinc-800/50 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:border-zinc-600/60 hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 6h8a4 4 0 0 1 0 8H6"/>
                <path d="M2 6l3-3M2 6l3 3"/>
              </svg>
              Recuar
              {historyLen > 0 && (
                <span className="rounded-full bg-zinc-700/60 px-1.5 py-0.5 text-[9px] tabular-nums text-zinc-400">
                  {historyLen}
                </span>
              )}
            </button>

            <div className="h-5 w-px bg-zinc-700/50" />

            <button
              type="button"
              disabled={futureLen === 0 || clientModelagemReadOnly}
              onClick={redo}
              title="Refazer (Ctrl+Y)"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-700/40 bg-zinc-800/50 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:border-zinc-600/60 hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              Avançar
              {futureLen > 0 && (
                <span className="rounded-full bg-zinc-700/60 px-1.5 py-0.5 text-[9px] tabular-nums text-zinc-400">
                  {futureLen}
                </span>
              )}
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 6H6a4 4 0 0 0 0 8h4"/>
                <path d="M14 6l-3-3M14 6l-3 3"/>
              </svg>
            </button>
          </div>

          <ModelagemSidePanelTabs
            tab={sidePanelTab}
            onTabChange={setSidePanelTab}
            layerCount={activeLayers.length}
            hasSelection={selected != null}
          />

          {/* ── Duas colunas: Texto | Imagem ── */}
          {(sidePanelTab === "add" || sidePanelTab === "edit") && (
          <div key={sidePanelTab} className={`conta-animate-fade-up grid grid-cols-1 gap-3 sm:items-start ${sidePanelTab === "add" ? "sm:grid-cols-2" : ""}`}>

            {/* ══ COLUNA TEXTO ══ */}
            <div className={`flex flex-col gap-2.5 ${sidePanelTab === "add" ? "sm:border-r sm:border-zinc-800/60 sm:pr-3" : ""}`}>
              {sidePanelTab === "add" ? (
              <>
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 3h8M6 3v6"/></svg>
                Texto
              </p>

              <button
                type="button"
                disabled={clientModelagemReadOnly}
                onClick={addText}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-3 py-2.5 text-xs font-semibold text-zinc-950 shadow-md shadow-amber-500/15 transition hover:from-amber-300 hover:to-amber-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:from-amber-400 disabled:hover:to-amber-500"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M4 8h8" strokeLinecap="round"/></svg>
                Adicionar texto
              </button>

              {/* Botão modelos prontos */}
              <button
                type="button"
                disabled={clientModelagemReadOnly}
                onClick={() => setShowTemplateModal(true)}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-300 transition hover:border-violet-500/70 hover:bg-violet-500/20 hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-violet-500/40 disabled:hover:bg-violet-500/10"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="1" width="14" height="14" rx="2"/>
                  <path d="M1 6h14M6 16V6"/>
                </svg>
                Modelos prontos
              </button>

              {/* Stickers e emoji — painel expansível (poupa espaço no painel lateral) */}
              <div className="overflow-hidden rounded-xl border border-zinc-700/40 bg-zinc-900/35 ring-1 ring-white/[0.03]">
                <button
                  type="button"
                  id="stickers-emoji-trigger"
                  aria-expanded={stickersEmojiPanelOpen}
                  aria-controls="stickers-emoji-region"
                  disabled={clientModelagemReadOnly}
                  onClick={() => setStickersEmojiPanelOpen((o) => !o)}
                  className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition hover:bg-zinc-800/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 text-lg leading-none ring-1 ring-teal-500/20"
                    aria-hidden
                  >
                    ✨
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                      Stickers e emoji
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-zinc-500">
                      {EMOJI_QUICK.length} emoji · {VECTOR_STICKERS.length} stickers
                      {!stickersEmojiPanelOpen ? " — Carregar para mostrar" : ""}
                    </span>
                  </span>
                  <svg
                    className={`h-5 w-5 shrink-0 text-zinc-500 transition-transform duration-200 ${stickersEmojiPanelOpen ? "rotate-180" : ""}`}
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M5 7.5L10 12.5L15 7.5"/>
                  </svg>
                </button>

                {stickersEmojiPanelOpen && (
                  <div
                    id="stickers-emoji-region"
                    role="region"
                    aria-labelledby="stickers-emoji-trigger"
                    className="border-t border-zinc-800/65 px-2.5 pb-2.5 pt-1"
                  >
                    <p className="mb-1.5 flex items-center justify-between gap-2 text-[9px] font-medium text-zinc-600">
                      <span>Emoji</span>
                      <span className="shrink-0 tabular-nums text-zinc-500">{EMOJI_QUICK.length}</span>
                    </p>
                    <div className="mb-3 max-h-[min(220px,36svh)] overflow-y-auto overscroll-contain pr-0.5 grid grid-cols-6 gap-1 sm:grid-cols-8">
                      {EMOJI_QUICK.map((ch, idx) => (
                        <button
                          key={`emoji-${idx}`}
                          type="button"
                          title={`Adicionar emoji ${ch}`}
                          aria-label={`Adicionar emoji ${ch}`}
                          onClick={() => addEmojiLayer(ch)}
                          disabled={clientModelagemReadOnly}
                          className="flex h-9 items-center justify-center rounded-lg border border-zinc-700/50 bg-zinc-800/40 text-lg leading-none transition hover:border-amber-500/35 hover:bg-zinc-800 active:scale-95 sm:h-8 sm:text-base disabled:pointer-events-none disabled:opacity-35"
                        >
                          {ch}
                        </button>
                      ))}
                    </div>
                    <p className="mb-1.5 flex items-center justify-between gap-2 text-[9px] font-medium text-zinc-600">
                      <span>Stickers</span>
                      <span className="shrink-0 tabular-nums text-zinc-500">{VECTOR_STICKERS.length}</span>
                    </p>
                    <div className="max-h-[min(200px,32svh)] overflow-y-auto overscroll-contain pr-0.5 grid grid-cols-4 gap-1.5 sm:grid-cols-4">
                      {VECTOR_STICKERS.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          title={s.label}
                          aria-label={`Adicionar sticker ${s.label}`}
                          onClick={() => addStickerFromSvgMarkup(s.svg, s.label)}
                          disabled={clientModelagemReadOnly}
                          className="group flex aspect-square items-center justify-center rounded-lg border border-zinc-700/50 bg-zinc-950/50 p-1 transition hover:border-teal-500/45 hover:bg-zinc-900 active:scale-95 disabled:pointer-events-none disabled:opacity-35"
                        >
                          <span
                            className="pointer-events-none flex max-h-[32px] w-full items-center justify-center [&>svg]:h-auto [&>svg]:max-h-[32px] [&>svg]:w-full [&>svg]:max-w-[32px]"
                            // SVG estático definido neste módulo
                            dangerouslySetInnerHTML={{ __html: s.svg }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              </>
              ) : null}

              {/* Editar camada de texto */}
              {sidePanelTab === "edit" && selected?.kind === "text" && (() => {
                const tl = selected as TextLayerEx;
                const dmReadonly = clientModelagemReadOnly;
                return (
                  <div className="rounded-xl border border-amber-700/25 bg-zinc-900/50 p-3 space-y-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-500/80">Editar texto</p>
                    {dmReadonly ? (
                      <p className="rounded-lg border border-sky-500/25 bg-sky-950/30 px-2.5 py-2 text-[10px] leading-relaxed text-sky-200/90">
                        Camada do modelo de designer — só consulta nesta fase.
                      </p>
                    ) : null}
                    <fieldset disabled={dmReadonly} className="m-0 min-w-0 space-y-3 border-0 p-0 disabled:pointer-events-none disabled:opacity-55">

                    {/* Texto */}
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-zinc-400">Texto</label>
                      <textarea
                        value={tl.text}
                        rows={3}
                        onChange={(e) => patchLayer(tl.id, { text: e.target.value } as Partial<TextLayerEx>)}
                        className="w-full resize-none rounded-lg border border-zinc-600/50 bg-zinc-900 px-2.5 py-2 text-sm text-white outline-none transition focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 sm:rows-[2] sm:text-xs"
                      />
                    </div>

                    {/* Fonte */}
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-zinc-400">Fonte</label>
                      <select
                        value={
                          FONTS.find((f) => f.css === tl.fontFamily)?.id ??
                          sysFonts.find((f) => f.css === tl.fontFamily)?.family ??
                          "sans"
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          const staticFont = FONTS.find((f) => f.id === val);
                          const sysFont = sysFonts.find((f) => f.family === val);
                          patchLayer(tl.id, {
                            fontFamily: staticFont?.css ?? sysFont?.css ?? fontCss(val),
                          } as Partial<TextLayerEx>);
                        }}
                        className="w-full rounded-lg border border-zinc-600/50 bg-zinc-900 px-2 py-2.5 text-[11px] text-white outline-none transition focus:border-amber-500/40 sm:py-1.5"
                      >
                        <optgroup label="Genéricas">
                          {FONTS.filter((f) => !f.google).map((f) => (
                            <option key={f.id} value={f.id}>{f.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Google Fonts">
                          {FONTS.filter((f) => f.google).map((f) => (
                            <option key={f.id} value={f.id}>{f.label}</option>
                          ))}
                        </optgroup>
                        {sysFonts.length > 0 && (
                          <optgroup label={`Sistema (${sysFonts.length} detetadas)`}>
                            {sysFonts.map((f) => (
                              <option key={f.family} value={f.family}>{f.family}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>

                    <ModelagemColorPalette
                      label="Cor do texto"
                      value={hexColor(tl.color)}
                      onChange={(hex) => patchLayer(tl.id, { color: hex } as Partial<TextLayerEx>)}
                      density={deviceLayout.isPhone ? "touch" : "compact"}
                    />

                    {/* Tamanho */}
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-[11px] font-medium text-zinc-400">Tamanho</label>
                        <input
                          type="number" min={6} max={150}
                          value={tl.fontSize}
                          onChange={(e) => {
                            const s = sanitizeUnsignedIntString(e.target.value);
                            if (s === "") return;
                            const n = Number.parseInt(s, 10);
                            if (!Number.isFinite(n)) return;
                            const v = Math.max(6, Math.min(150, n));
                            patchLayer(tl.id, { fontSize: v } as Partial<TextLayerEx>);
                          }}
                          className="w-14 rounded border border-zinc-600/50 bg-zinc-800 px-1 py-0.5 text-center text-[11px] tabular-nums text-white outline-none focus:border-amber-500/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </div>
                      <input type="range" min={6} max={150} value={tl.fontSize}
                        onChange={(e) => patchLayer(tl.id, { fontSize: +e.target.value } as Partial<TextLayerEx>)}
                        className="w-full touch-manipulation accent-amber-500" />
                    </div>

                    {/* Bold / Italic / Alinhamento */}
                    <div className="flex gap-1.5">
                      <button type="button"
                        onClick={() => patchLayer(tl.id, { bold: !tl.bold } as Partial<TextLayerEx>)}
                        className={`flex-1 rounded-lg border py-2.5 text-xs font-bold transition sm:py-1.5 ${tl.bold ? "border-amber-500/50 bg-amber-500/15 text-amber-200" : "border-zinc-600/50 bg-zinc-800/50 text-zinc-300 hover:border-zinc-500"}`}>B</button>
                      <button type="button"
                        onClick={() => patchLayer(tl.id, { italic: !tl.italic } as Partial<TextLayerEx>)}
                        className={`flex-1 rounded-lg border py-2.5 text-xs italic transition sm:py-1.5 ${tl.italic ? "border-amber-500/50 bg-amber-500/15 text-amber-200" : "border-zinc-600/50 bg-zinc-800/50 text-zinc-300 hover:border-zinc-500"}`}>I</button>
                      <div className="h-auto w-px bg-zinc-700/50" />
                      {/* Alinhamento: esquerda / centro / direita */}
                      {(["left", "center", "right"] as const).map((align) => (
                        <button key={align} type="button"
                          title={{ left: "Alinhar à esquerda", center: "Centrar", right: "Alinhar à direita" }[align]}
                          onClick={() => patchLayer(tl.id, { textAlign: align } as Partial<TextLayerEx>)}
                          className={`flex flex-1 items-center justify-center rounded-lg border py-2.5 transition sm:py-1.5 ${(tl.textAlign ?? "center") === align ? "border-amber-500/50 bg-amber-500/15 text-amber-200" : "border-zinc-600/50 bg-zinc-800/50 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"}`}>
                          <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                            {align === "left"   && <><path d="M2 3h10M2 7h6M2 11h8"/></>}
                            {align === "center" && <><path d="M2 3h10M4 7h6M3 11h8"/></>}
                            {align === "right"  && <><path d="M2 3h10M6 7h6M4 11h8"/></>}
                          </svg>
                        </button>
                      ))}
                    </div>

                    {/* Espaçamento entre letras */}
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-[11px] font-medium text-zinc-400">Espaç. letras</label>
                        <input
                          type="number" min={0} max={20} step={0.5}
                          value={tl.letterSpacing ?? 0}
                          onChange={(e) => {
                            const s = sanitizeUnsignedDecimalString(e.target.value, 1);
                            if (s === "") return;
                            if (/[.,]$/.test(s)) return;
                            const n = Number.parseFloat(s.replace(",", "."));
                            if (!Number.isFinite(n)) return;
                            const v = Math.max(0, Math.min(20, n));
                            patchLayer(tl.id, { letterSpacing: v } as Partial<TextLayerEx>);
                          }}
                          className="w-14 rounded border border-zinc-600/50 bg-zinc-800 px-1 py-0.5 text-center text-[11px] tabular-nums text-white outline-none focus:border-amber-500/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </div>
                      <input type="range" min={0} max={20} step={0.5} value={tl.letterSpacing ?? 0}
                        onChange={(e) => patchLayer(tl.id, { letterSpacing: +e.target.value } as Partial<TextLayerEx>)}
                        className="w-full touch-manipulation accent-amber-500" />
                    </div>

                    {/* Efeito de texto */}
                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium text-zinc-400">Efeito de texto</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(["normal", "curved", "3d"] as TextEffect[]).map((ef) => {
                          const labels: Record<TextEffect, string> = { normal: "Normal", curved: "∿ Curvo", "3d": "⬚ 3D" };
                          return (
                            <button key={ef} type="button"
                              onClick={() => patchLayer(tl.id, {
                                textEffect: ef,
                                ...(ef === "curved"
                                  ? {
                                      curveStyle: "upright" as CurveStyle,
                                      curveRadius: tl.curveRadius >= 120 ? tl.curveRadius : 320,
                                    }
                                  : {}),
                              } as Partial<TextLayerEx>)}
                              className={`rounded-lg border py-2 text-[11px] font-medium transition ${tl.textEffect === ef ? "border-amber-500/50 bg-amber-500/15 text-amber-200" : "border-zinc-600/50 bg-zinc-800/40 text-zinc-300 hover:border-zinc-500 hover:text-white"}`}>
                              {labels[ef]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Controles do efeito Curvo */}
                    {tl.textEffect === "curved" && (
                      <div className="space-y-2.5">
                        <div>
                          <label className="mb-1.5 block text-[11px] font-medium text-zinc-400">Estilo da curva</label>
                          <div className="grid grid-cols-3 gap-1.5">
                            {(
                              [
                                { id: "upright" as CurveStyle, label: "Moderno", hint: "Letras verticais" },
                                { id: "wave" as CurveStyle, label: "Onda", hint: "Fluxo suave" },
                                { id: "radial" as CurveStyle, label: "Clássico", hint: "Emblema" },
                              ] as const
                            ).map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                title={opt.hint}
                                onClick={() => patchLayer(tl.id, { curveStyle: opt.id } as Partial<TextLayerEx>)}
                                className={`rounded-lg border py-2 text-[10px] font-medium transition ${
                                  (tl.curveStyle ?? "radial") === opt.id
                                    ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                                    : "border-zinc-600/50 bg-zinc-800/40 text-zinc-400 hover:border-zinc-500 hover:text-white"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[11px] font-medium text-zinc-400">Direção</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button type="button"
                              onClick={() => patchLayer(tl.id, { curveFlip: false } as Partial<TextLayerEx>)}
                              className={`flex flex-col items-center gap-1 rounded-lg border py-2 text-[10px] font-medium transition ${!tl.curveFlip ? "border-amber-500/40 bg-zinc-950/30 text-amber-300" : "border-zinc-700/50 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600/60 hover:text-zinc-200"}`}>
                              <svg viewBox="0 0 40 20" className="h-5 w-10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M4 16 Q20 4 36 16" />
                              </svg>
                              Para cima
                            </button>
                            <button type="button"
                              onClick={() => patchLayer(tl.id, { curveFlip: true } as Partial<TextLayerEx>)}
                              className={`flex flex-col items-center gap-1 rounded-lg border py-2 text-[10px] font-medium transition ${tl.curveFlip ? "border-amber-500/40 bg-zinc-950/30 text-amber-300" : "border-zinc-700/50 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600/60 hover:text-zinc-200"}`}>
                              <svg viewBox="0 0 40 20" className="h-5 w-10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M4 4 Q20 16 36 4" />
                              </svg>
                              Para baixo
                            </button>
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <label className="text-[11px] font-medium text-zinc-400">
                              {(tl.curveStyle ?? "radial") === "wave" ? "Intensidade da onda" : "Curvatura"}
                            </label>
                            <span className="text-[11px] tabular-nums text-zinc-500">{tl.curveRadius}px</span>
                          </div>
                          <input type="range" min={60} max={800} step={5} value={tl.curveRadius}
                            onChange={(e) => patchLayer(tl.id, { curveRadius: +e.target.value } as Partial<TextLayerEx>)}
                            className="w-full touch-manipulation accent-amber-500" />
                          <p className="mt-0.5 text-[10px] text-zinc-600">
                            {(tl.curveStyle ?? "radial") === "wave"
                              ? "Valor alto = onda mais suave · baixo = mais pronunciada"
                              : "Valor baixo = arco mais fechado · alto = curva aberta"}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Controles do efeito 3D */}
                    {tl.textEffect === "3d" && (
                      <div className="space-y-3">
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <label className="text-[11px] font-medium text-zinc-400">Profundidade 3D</label>
                            <span className="text-[11px] tabular-nums text-zinc-500">{tl.depth3d}px</span>
                          </div>
                          <input type="range" min={1} max={24} value={tl.depth3d}
                            onChange={(e) => patchLayer(tl.id, { depth3d: +e.target.value } as Partial<TextLayerEx>)}
                            className="w-full touch-manipulation accent-amber-500" />
                        </div>
                        <div>
                          <ModelagemColorPalette
                            label="Cor da sombra 3D"
                            value={tl.depthColor || "#1a0500"}
                            onChange={(hex) => patchLayer(tl.id, { depthColor: hex } as Partial<TextLayerEx>)}
                            density={deviceLayout.isPhone ? "touch" : "compact"}
                          />
                        </div>
                      </div>
                    )}

                    {/* Rotação */}
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-[11px] font-medium text-zinc-400">Rotação</label>
                        <input
                          type="number" min={-180} max={180}
                          value={tl.rotationDeg}
                          onChange={(e) => {
                            const s = sanitizeSignedIntString(e.target.value);
                            if (s === "" || s === "-") return;
                            const n = Number.parseInt(s, 10);
                            if (!Number.isFinite(n)) return;
                            const v = Math.max(-180, Math.min(180, n));
                            patchLayer(tl.id, { rotationDeg: v });
                          }}
                          className="w-16 rounded border border-zinc-600/50 bg-zinc-800 px-1 py-0.5 text-center text-[11px] tabular-nums text-white outline-none focus:border-amber-500/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </div>
                      <input type="range" min={-180} max={180} value={tl.rotationDeg}
                        onChange={(e) => patchLayer(tl.id, { rotationDeg: +e.target.value })}
                        className="w-full touch-manipulation accent-amber-500" />
                    </div>

                    {/* Posição X / Y */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-[11px] font-medium text-zinc-400">Pos. X</label>
                          <span className="text-[11px] tabular-nums text-zinc-500">{Math.round(tl.x * 100)}%</span>
                        </div>
                        <input type="range" min={0} max={100} value={Math.round(tl.x * 100)}
                          onChange={(e) => patchLayer(tl.id, { x: +e.target.value / 100 })}
                          className="w-full touch-manipulation accent-amber-500" />
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-[11px] font-medium text-zinc-400">Pos. Y</label>
                          <span className="text-[11px] tabular-nums text-zinc-500">{Math.round(tl.y * 100)}%</span>
                        </div>
                        <input type="range" min={0} max={100} value={Math.round(tl.y * 100)}
                          onChange={(e) => patchLayer(tl.id, { y: +e.target.value / 100 })}
                          className="w-full touch-manipulation accent-amber-500" />
                      </div>
                    </div>

                    {/* Opacidade */}
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-[11px] font-medium text-zinc-400">Opacidade</label>
                        <span className="text-[11px] tabular-nums text-zinc-500">{Math.round(tl.opacity * 100)}%</span>
                      </div>
                      <input type="range" min={5} max={100} value={Math.round(tl.opacity * 100)}
                        onChange={(e) => patchLayer(tl.id, { opacity: +e.target.value / 100 } as Partial<TextLayerEx>)}
                        className="w-full touch-manipulation accent-amber-500" />
                    </div>

                    {/* Contorno */}
                    <div className="space-y-2">
                      <ModelagemColorPalette
                        label="Cor do contorno"
                        value={tl.strokeColor || "#000000"}
                        onChange={(hex) =>
                          patchLayer(tl.id, {
                            strokeColor: hex,
                            strokeWidth: tl.strokeWidth === 0 ? 2 : tl.strokeWidth,
                          } as Partial<TextLayerEx>)
                        }
                        density={deviceLayout.isPhone ? "touch" : "compact"}
                      />
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-[11px] font-medium text-zinc-400">Espessura do contorno</label>
                          <span className="text-[11px] tabular-nums text-zinc-500">{tl.strokeWidth}px</span>
                        </div>
                        <input type="range" min={0} max={12} value={tl.strokeWidth}
                          onChange={(e) => patchLayer(tl.id, { strokeWidth: +e.target.value } as Partial<TextLayerEx>)}
                          className="w-full touch-manipulation accent-amber-500" />
                      </div>
                    </div>

                    {/* Centrar */}
                    <button type="button" onClick={() => centerLayer(tl.id)}
                      className="w-full rounded-lg border border-zinc-600/50 bg-zinc-800/40 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white">
                      Centrar na peça
                    </button>
                    </fieldset>
                  </div>
                );
              })()}
            </div>

            {/* ══ COLUNA IMAGEM ══ */}
            {(sidePanelTab === "add" || (sidePanelTab === "edit" && selected?.kind === "image")) && (
            <div className="flex flex-col gap-2.5">
              {sidePanelTab === "add" ? (
              <>
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="1" width="10" height="10" rx="2"/><circle cx="4" cy="4" r="1" fill="currentColor" stroke="none"/><path d="M1 8l3-3 2 2 2-2 3 3"/></svg>
                Imagem
              </p>

              {/* Zona de drag-and-drop */}
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
                multiple
                disabled={clientModelagemReadOnly}
                onChange={onPickFiles}
              />
              <div
                role="button"
                tabIndex={clientModelagemReadOnly ? -1 : 0}
                onClick={() =>
                  !uploadBusy &&
                  !clientModelagemReadOnly &&
                  fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (clientModelagemReadOnly || uploadBusy) return;
                  if (e.key === "Enter") fileInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!clientModelagemReadOnly) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  if (clientModelagemReadOnly) {
                    e.preventDefault();
                    return;
                  }
                  onDrop(e);
                }}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-4 text-center transition select-none ${
                  clientModelagemReadOnly
                    ? "cursor-not-allowed border-zinc-700/40 bg-zinc-950/40 opacity-50 pointer-events-none"
                    : "cursor-pointer"
                } ${
                  !clientModelagemReadOnly && dragOver
                    ? "border-amber-400/70 bg-zinc-950/30 scale-[1.01]"
                    : !clientModelagemReadOnly
                      ? "border-zinc-600/50 hover:border-zinc-500/70 hover:bg-zinc-900/40"
                      : ""
                } ${uploadBusy ? "cursor-wait opacity-70" : ""}`}
              >
                {uploadBusy ? (
                  <>
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" />
                    <span className="text-[11px] font-medium text-zinc-400">A enviar…</span>
                  </>
                ) : dragOver ? (
                  <>
                    <svg className="h-6 w-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 4v12m-4-4 4-4 4 4" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M4 20h16" strokeLinecap="round"/>
                    </svg>
                    <span className="text-[11px] font-semibold text-amber-300">Soltar aqui</span>
                  </>
                ) : (
                  <>
                    <svg className="h-6 w-6 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M3 16v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" strokeLinecap="round"/>
                      <path d="M12 4v12m-4-4 4-4 4 4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <div>
                      <p className="text-[11px] font-medium text-zinc-300">Arraste imagens aqui</p>
                      <p className="mt-1 text-[10px] text-zinc-500">ou clique — PNG, JPG, SVG · fica ligado ao pedido e aparece já na arte</p>
                    </div>
                  </>
                )}
              </div>
              {uploadErr && <p className="text-[11px] text-red-400" role="alert">{uploadErr}</p>}

              {svgFiles.length > 0 && (
                <p className="rounded-lg border border-amber-500/25 bg-black/20 px-2.5 py-2 text-[10px] text-amber-300">
                  {svgFiles.length} ficheiro(s) SVG — não editáveis no canvas. Use PNG ou JPG.
                </p>
              )}
              </>
              ) : null}

              {/* Editar camada de imagem */}
              {sidePanelTab === "edit" && selected?.kind === "image" && (() => {
                const il = selected as ImageLayerEx;
                const dmReadonly = clientModelagemReadOnly;
                return (
                  <div className="rounded-xl border border-violet-700/25 bg-zinc-900/50 p-3 space-y-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400/80">Editar imagem</p>
                    {dmReadonly ? (
                      <p className="rounded-lg border border-sky-500/25 bg-sky-950/30 px-2.5 py-2 text-[10px] leading-relaxed text-sky-200/90">
                        Camada do modelo de designer — só consulta nesta fase.
                      </p>
                    ) : null}

                    {/* Mini-preview */}
                    <div className="overflow-hidden rounded-lg border border-zinc-700/40"
                      style={{ backgroundImage: "conic-gradient(#1e293b 25%,#0f172a 0 50%,#1e293b 0 75%,#0f172a 0)", backgroundSize: "10px 10px" }}>
                      <img src={il.src} alt="pré-visualização" className="mx-auto block max-h-24 object-contain" />
                    </div>

                    <fieldset disabled={dmReadonly} className="m-0 min-w-0 space-y-3 border-0 p-0 disabled:pointer-events-none disabled:opacity-55">

                    {/* Largura */}
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-[11px] font-medium text-zinc-400">Largura</label>
                        <input
                          type="number" min={10} max={95}
                          value={Math.round(il.widthRel * 100)}
                          onChange={(e) => {
                            const s = sanitizeUnsignedIntString(e.target.value);
                            if (s === "") return;
                            const n = Number.parseInt(s, 10);
                            if (!Number.isFinite(n)) return;
                            const v = Math.max(10, Math.min(95, n));
                            patchLayer(il.id, { widthRel: v / 100 } as Partial<ImageLayerEx>);
                          }}
                          className="w-14 rounded border border-zinc-600/50 bg-zinc-800 px-1 py-0.5 text-center text-[11px] tabular-nums text-white outline-none focus:border-amber-500/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </div>
                      <input type="range" min={10} max={95} value={Math.round(il.widthRel * 100)}
                        onChange={(e) => patchLayer(il.id, { widthRel: +e.target.value / 100 } as Partial<ImageLayerEx>)}
                        className="w-full touch-manipulation accent-amber-500" />
                    </div>

                    {/* Rotação */}
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-[11px] font-medium text-zinc-400">Rotação</label>
                        <input
                          type="number" min={-180} max={180}
                          value={il.rotationDeg}
                          onChange={(e) => {
                            const s = sanitizeSignedIntString(e.target.value);
                            if (s === "" || s === "-") return;
                            const n = Number.parseInt(s, 10);
                            if (!Number.isFinite(n)) return;
                            const v = Math.max(-180, Math.min(180, n));
                            patchLayer(il.id, { rotationDeg: v });
                          }}
                          className="w-16 rounded border border-zinc-600/50 bg-zinc-800 px-1 py-0.5 text-center text-[11px] tabular-nums text-white outline-none focus:border-amber-500/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </div>
                      <input type="range" min={-180} max={180} value={il.rotationDeg}
                        onChange={(e) => patchLayer(il.id, { rotationDeg: +e.target.value })}
                        className="w-full touch-manipulation accent-amber-500" />
                    </div>

                    {/* Posição */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-[11px] font-medium text-zinc-400">Pos. X</label>
                          <span className="text-[11px] tabular-nums text-zinc-500">{Math.round(il.x * 100)}%</span>
                        </div>
                        <input type="range" min={0} max={100} value={Math.round(il.x * 100)}
                          onChange={(e) => patchLayer(il.id, { x: +e.target.value / 100 })}
                          className="w-full touch-manipulation accent-amber-500" />
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-[11px] font-medium text-zinc-400">Pos. Y</label>
                          <span className="text-[11px] tabular-nums text-zinc-500">{Math.round(il.y * 100)}%</span>
                        </div>
                        <input type="range" min={0} max={100} value={Math.round(il.y * 100)}
                          onChange={(e) => patchLayer(il.id, { y: +e.target.value / 100 })}
                          className="w-full touch-manipulation accent-amber-500" />
                      </div>
                    </div>

                    {/* Opacidade */}
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-[11px] font-medium text-zinc-400">Opacidade</label>
                        <span className="text-[11px] tabular-nums text-zinc-500">{Math.round(il.opacity * 100)}%</span>
                      </div>
                      <input type="range" min={5} max={100} value={Math.round(il.opacity * 100)}
                        onChange={(e) => patchLayer(il.id, { opacity: +e.target.value / 100 } as Partial<ImageLayerEx>)}
                        className="w-full touch-manipulation accent-amber-500" />
                    </div>

                    {/* Espelhar + Centrar */}
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button"
                        onClick={() => patchLayer(il.id, { flipX: !il.flipX } as Partial<ImageLayerEx>)}
                        className={`rounded-lg border py-2 text-[11px] font-medium transition ${il.flipX ? "border-amber-500/50 bg-amber-500/15 text-amber-200" : "border-zinc-600/50 bg-zinc-800/40 text-zinc-300 hover:bg-zinc-800"}`}>
                        ↔ Espelhar
                      </button>
                      <button type="button" onClick={() => centerLayer(il.id)}
                        className="rounded-lg border border-zinc-600/50 bg-zinc-800/40 py-2 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white">
                        Centrar
                      </button>
                    </div>

                    {/* Recortar */}
                    <button type="button" onClick={() => setCropLayerId(il.id)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-600/50 bg-zinc-800/40 py-2 text-[11px] font-medium text-zinc-300 transition hover:border-amber-500/35 hover:bg-zinc-800 hover:text-amber-100">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path d="M1 4h3M4 1v3M12 1v3M15 4h-3M1 12h3M4 15v-3M12 15v-3M15 12h-3" strokeLinecap="round"/>
                        <rect x="4" y="4" width="8" height="8" rx="1"/>
                      </svg>
                      Recortar imagem
                    </button>

                    {/* Remover fundo */}
                    <div className="rounded-xl border border-violet-500/20 bg-violet-950/20 p-2.5">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400/80">Remover fundo</p>
                        <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-medium text-violet-300">Fundos sólidos</span>
                      </div>
                      <div className="mb-2.5">
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-[11px] font-medium text-zinc-400">Tolerância de cor</label>
                          <span className="tabular-nums text-[11px] text-zinc-500">{bgTolerance}</span>
                        </div>
                        <input type="range" min={5} max={100} value={bgTolerance}
                          onChange={(e) => { setBgTolerance(+e.target.value); setRemoveBgErr(null); }}
                          className="w-full touch-manipulation accent-violet-500" />
                        <div className="mt-0.5 flex justify-between text-[9px] text-zinc-600">
                          <span>Preciso</span><span>↑ se restar resíduos</span><span>Agressivo</span>
                        </div>
                      </div>
                      <button type="button" disabled={removingBgId === il.id}
                        onClick={() => { setRemoveBgErr(null); void removeBg(il.id); }}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-500/35 bg-violet-500/10 py-2 text-[11px] font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-wait disabled:opacity-60">
                        {removingBgId === il.id ? (
                          <><span className="h-3 w-3 animate-spin rounded-full border border-violet-400/40 border-t-violet-300" />A processar…</>
                        ) : (
                          <><svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                            <rect x="2" y="2" width="5" height="5" rx="1" strokeDasharray="2 1.2"/>
                            <rect x="9" y="2" width="5" height="5" rx="1" strokeDasharray="2 1.2"/>
                            <rect x="2" y="9" width="5" height="5" rx="1" strokeDasharray="2 1.2"/>
                            <path d="M9 11.5h5M11.5 9v5" strokeLinecap="round"/>
                          </svg>Remover fundo</>
                        )}
                      </button>
                      {removeBgErr && (
                        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-red-500/25 bg-red-950/30 px-2.5 py-2">
                          <p className="text-[10px] text-red-300">{removeBgErr}</p>
                        </div>
                      )}
                      <p className="mt-1.5 text-[10px] text-zinc-600">Duplique a camada antes de aplicar — irreversível.</p>
                    </div>
                    </fieldset>
                  </div>
                );
              })()}
            </div>
            )}

            {sidePanelTab === "edit" && !selected && (
              <p className="rounded-xl border border-zinc-700/40 bg-zinc-900/40 px-3 py-4 text-center text-[11px] leading-relaxed text-zinc-500">
                Selecciona uma camada no mockup ou no separador «Camadas» para editar propriedades.
              </p>
            )}

          </div>
          )}

          {sidePanelTab === "layers" && (
          <>
          {/* Remover camada — largura total */}
          {selected && (
            <button type="button" disabled={clientModelagemReadOnly} onClick={() => removeLayer(selected.id)}
              className="w-full rounded-lg border border-red-500/30 bg-red-950/20 py-2 text-[11px] font-medium text-red-300 transition hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-red-950/20">
              Remover camada seleccionada
            </button>
          )}

                    {/* Lista de camadas — drag-and-drop para reordenar */}
          {activeLayers.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                  Camadas
                  <span className="ml-1.5 text-zinc-700">↑ frente · ↓ fundo</span>
                </p>
                <span className="text-[9px] text-zinc-600">arrasta para reordenar</span>
              </div>
              <div className="space-y-0.5">
                {[...activeLayers].sort((a, b) => b.zIndex - a.zIndex).map((layer) => {
                  const active    = layer.id === selectedId;
                  const isDragging = layer.id === layerDragId;
                  const isOver     = layer.id === layerDragOverId && layer.id !== layerDragId;
                  const layerRo    = clientModelagemReadOnly;
                  const rawName   = layer.kind === "image"
                    ? ((layer as ImageLayerEx).name ?? "Imagem")
                    : null;
                  const imgLabel  = rawName ? rawName.replace(/\.[^.]+$/, "") : "Imagem";
                  const label     = layer.kind === "text"
                    ? `"${(layer as TextLayerEx).text.slice(0, 20)}${(layer as TextLayerEx).text.length > 20 ? "…" : ""}"`
                    : imgLabel;
                  return (
                    <div
                      key={layer.id}
                      draggable={!layerRo}
                      onDragStart={(e) => {
                        if (layerRo) {
                          e.preventDefault();
                          return;
                        }
                        setLayerDragId(layer.id);
                        e.dataTransfer.effectAllowed = "move";
                        // miniatura discreta no fantasma
                        e.dataTransfer.setDragImage(e.currentTarget, 12, 12);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (layer.id !== layerDragId) setLayerDragOverId(layer.id);
                      }}
                      onDragLeave={() => setLayerDragOverId(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (layerDragId) reorderLayer(layerDragId, layer.id);
                        setLayerDragId(null);
                        setLayerDragOverId(null);
                      }}
                      onDragEnd={() => {
                        setLayerDragId(null);
                        setLayerDragOverId(null);
                      }}
                      className={[
                        "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition select-none",
                        active    ? "border-amber-500/35 bg-zinc-950/20"           : "border-zinc-700/40 bg-zinc-900/40 hover:border-zinc-600/50",
                        isDragging ? "opacity-40 scale-[0.97]"                   : "",
                        isOver    ? "border-amber-400/60 bg-zinc-950/30 shadow-[inset_0_2px_0_0_rgba(45,212,191,0.35)]" : "",
                        layerRo ? "border-sky-800/35 bg-zinc-950/30" : "",
                      ].join(" ")}
                    >
                      {/* Alça de drag — 6 pontos */}
                      <div
                        className={`flex shrink-0 items-center ${layerRo ? "cursor-not-allowed text-zinc-600/35" : "cursor-grab text-zinc-600 active:cursor-grabbing"}`}
                        title={layerRo ? "Ordem protegida (modelo designer)" : "Arrastar para reordenar"}
                      >
                        <svg className="h-3.5 w-3.5 text-zinc-600" viewBox="0 0 10 16" fill="currentColor">
                          <circle cx="3" cy="3"  r="1.2"/><circle cx="7" cy="3"  r="1.2"/>
                          <circle cx="3" cy="8"  r="1.2"/><circle cx="7" cy="8"  r="1.2"/>
                          <circle cx="3" cy="13" r="1.2"/><circle cx="7" cy="13" r="1.2"/>
                        </svg>
                      </div>

                      {/* Nome / selecionar */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(active ? null : layer.id);
                          if (!active) setSidePanelTab("edit");
                        }}
                        title={layer.kind === "image" ? ((layer as ImageLayerEx).name ?? undefined) : undefined}
                        className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-zinc-200"
                      >
                        <span className="mr-1.5 text-zinc-500">{layer.kind === "text" ? "Aa" : "🖼"}</span>
                        {label}
                      </button>

                      {/* Duplicar — permitido mesmo em modelo designer (a cópia é editável) */}
                      <button type="button" title={layerRo ? "Duplica para uma cópia editável" : undefined} onClick={() => duplicateLayer(layer.id)}
                        className="shrink-0 rounded p-1 text-zinc-600 transition hover:text-amber-400" aria-label="Duplicar">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8">
                          <rect x="4" y="4" width="8" height="8" rx="1.5"/>
                          <path d="M2 10V3a1 1 0 0 1 1-1h7" strokeLinecap="round"/>
                        </svg>
                      </button>

                      {/* Remover */}
                      <button type="button" disabled={layerRo} onClick={() => removeLayer(layer.id)}
                        className="shrink-0 rounded p-1 text-zinc-600 transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:text-zinc-600" aria-label="Remover">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="2">
                          <path d="M2 2l10 10M12 2 2 12" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {sidePanelTab === "layers" && activeLayers.length === 0 && (
            <p className="rounded-xl border border-zinc-700/40 bg-zinc-900/40 px-3 py-4 text-center text-[11px] text-zinc-500">
              Ainda não há camadas — usa «Adicionar» para começar.
            </p>
          )}
          </>
          )}

          </div>{/* fim da área scrollável */}
        </div>
      </div>

      <div className="conta-animate-fade-up" style={{ "--conta-delay": "160ms" } as CSSProperties}>
      <ModelagemContextSections
        order={order}
        userRole={userRole}
        viewerUserId={viewerUserId}
        isPdvBalcaoModelagem={isPdvBalcaoModelagem}
        clientModelagemReadOnly={clientModelagemReadOnly}
        unread={unread}
        specsSlot={
          <ModelagemSpecsCard
            orderId={order.id}
            orderNumber={order.orderNumber ?? order.id.slice(0, 8)}
            modelagemSpecs={order.modelagemSpecs}
            canEdit={specsModelagemCanEdit}
            embedded
            onSaved={setOrder}
            onToast={(msg) => {
              setSaveDraftOk(msg);
              setSaveDraftErr(null);
            }}
          />
        }
      />
      </div>

      <ModelagemActionBar
        saveDraftBusy={saveDraftBusy}
        layersEmpty={layers.length === 0}
        clientModelagemReadOnly={clientModelagemReadOnly}
        showSubmit={showSubmitBtn}
        showBalcaoContinue={showBalcaoBtn}
        isStaff={isStaff}
        podeExportarSpecs={podeExportarSpecsServidor}
        saveDraftOk={saveDraftOk}
        saveDraftErr={saveDraftErr}
        autoSaveLabel={autoSaveLabel}
        onSaveDraft={() => void saveDraft()}
        onExportPng={exportPng}
        onExportSpecsPdf={exportSpecsPdfSidebar}
        onExportSpecsCsv={exportSpecsCsvSidebar}
        onSaveTemplate={() => {
          setSaveTemplateTitle("");
          setSaveTemplateErr(null);
          setSaveTemplateOk(false);
          setShowSaveTemplateModal(true);
        }}
        onSubmit={() => void handleOpenSubmit()}
        onContinueBalcao={() => void continueToBalcaoPayment()}
        artigosHref={
          isClientOnlineDraft ? contaPedidoArtigosPath(order.id) : null
        }
      />

      {/* Modal de recorte */}
      {cropLayerId && (() => {
        const layer = layers.find((l) => l.id === cropLayerId);
        if (!layer || layer.kind !== "image") return null;
        const il = layer as ImageLayerEx;
        return (
          <ImageCropModal
            src={il.src}
            onApply={(newSrc, newAspect) => {
              pushHistory(layersRef.current);
              if (il.src.startsWith("blob:")) {
                URL.revokeObjectURL(il.src);
                blobUrlsRef.current.delete(il.src);
              }
              blobUrlsRef.current.add(newSrc);
              imageCacheRef.current.delete(cropLayerId);
              patchLayer(cropLayerId, { src: newSrc, aspect: newAspect } as Partial<ImageLayerEx>);
              setBumpRedraw((n) => n + 1);
              setCropLayerId(null);
            }}
            onClose={() => setCropLayerId(null)}
          />
        );
      })()}

      {/* ── Modal de modelos prontos ── */}
      {showTemplateModal && (
        <TemplatesModal
          onClose={() => setShowTemplateModal(false)}
          onApply={applyTemplate}
          currentGarmentType={modelagemPreview.productType}
        />
      )}

      {/* ── Modal de submissão do pedido ── */}
      {showSubmitModal && order && (
        <SubmitOrderModal
          order={order}
          designPreviewUrl={submitPreviewUrl}
          viewerRole={userRole}
          onBackToDesign={closeSubmitModal}
          onClose={closeSubmitModal}
          onConfirm={handleConfirmSubmit}
          onFinished={(detail) => void handleSubmitFinished(detail)}
        />
      )}

      {/* ── Modal: Guardar como Template (admin/designer) ── */}
      {showSaveTemplateModal && (
        <div className="conta-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="conta-modal-panel w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-700/60 bg-zinc-900 shadow-2xl">
            <div className="h-[2px] bg-gradient-to-r from-violet-600 via-violet-400 to-violet-600" />
            <div className="p-5">
              <h2 className="text-sm font-bold text-white">Guardar como Template</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                O design actual será guardado como modelo reutilizável.
              </p>

              <div className="mt-4 space-y-3">
                {/* Título */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-zinc-400">Título *</label>
                  <input
                    type="text"
                    value={saveTemplateTitle}
                    onChange={(e) => setSaveTemplateTitle(e.target.value)}
                    placeholder="Ex: Turma de Finalistas 2026"
                    className="w-full rounded-xl border border-zinc-700/60 bg-zinc-800/60 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/10"
                    autoFocus
                  />
                </div>

                {/* Categoria */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-zinc-400">Categoria</label>
                  <select
                    value={saveTemplateCategory}
                    onChange={(e) => setSaveTemplateCategory(e.target.value as DesignTemplateCategory)}
                    className="w-full rounded-xl border border-zinc-700/60 bg-zinc-800/60 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/50"
                  >
                    {(Object.entries(DESIGN_TEMPLATE_CATEGORY_LABELS) as [DesignTemplateCategory, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* Tipo de peça (read-only) */}
                {modelagemPreview.productType && (
                  <div className="flex items-center gap-2 rounded-xl border border-zinc-700/30 bg-zinc-800/30 px-3 py-2">
                    <svg className="h-3.5 w-3.5 shrink-0 text-zinc-500" fill="none" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                      <path d="M4 2C4 2 4.5 4 7 4C9.5 4 10 2 10 2L12 2.5C13 3 13.5 4 13.5 5L12 5.5C11.5 4.5 11 4.2 10.5 4.2L10.5 12L3.5 12L3.5 4.2C3 4.2 2.5 4.5 2 5.5L0.5 5C0.5 4 1 3 2 2.5Z"/>
                    </svg>
                    <span className="text-[11px] text-zinc-400">
                      Associado a: <span className="text-zinc-300">{modelagemPreview.productType}</span>
                    </span>
                  </div>
                )}

                {saveTemplateErr && (
                  <p className="text-[11px] text-red-400">{saveTemplateErr}</p>
                )}
                {saveTemplateOk && (
                  <p className="text-[11px] font-semibold text-violet-400">✓ Template guardado com sucesso!</p>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowSaveTemplateModal(false)}
                  className="flex-1 rounded-xl border border-zinc-700 py-2 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveAsTemplate()}
                  disabled={saveTemplateBusy || saveTemplateOk}
                  className="flex-1 rounded-xl bg-violet-600 py-2 text-xs font-bold text-white transition hover:bg-violet-500 disabled:opacity-50"
                >
                  {saveTemplateBusy ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <span className="h-3 w-3 animate-spin rounded-full border border-violet-300/30 border-t-violet-300" />
                      A guardar…
                    </span>
                  ) : "Guardar Template"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
