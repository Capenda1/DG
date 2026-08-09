import { animate, type JSAnimation } from "animejs";
import { stagger } from "animejs/utils";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Entrada em sequência para blocos do login (atributo `data-anime-login`). */
export function runLoginReveal(
  root: HTMLElement,
): () => void {
  if (prefersReducedMotion()) return () => {};

  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>("[data-anime-login]"),
  );
  if (nodes.length === 0) return () => {};

  let anim: JSAnimation | null = null;
  const raf = requestAnimationFrame(() => {
    nodes.forEach((el) => {
      el.style.opacity = "0";
    });
    anim = animate(nodes, {
      opacity: [0, 1],
      translateY: [18, 0],
      duration: 520,
      ease: "outCubic",
      delay: stagger(72, { start: 0 }),
    });
  });

  return () => {
    cancelAnimationFrame(raf);
    anim?.revert();
    nodes.forEach((el) => {
      el.style.opacity = "";
      el.style.translate = "";
    });
  };
}

/** Pequeno “shake” quando aparece erro de formulário. */
export function runFormErrorShake(el: HTMLElement): () => void {
  if (prefersReducedMotion()) return () => {};
  const anim = animate(el, {
    translateX: [0, -8, 8, -5, 5, -2, 2, 0],
    duration: 480,
    ease: "linear",
  });
  return () => {
    anim.revert();
    el.style.translate = "";
  };
}

export function runOverlayEnter(
  backdrop: HTMLElement,
  panel: HTMLElement,
): () => void {
  if (prefersReducedMotion()) {
    backdrop.style.opacity = "1";
    panel.style.opacity = "1";
    return () => {
      backdrop.style.opacity = "";
      panel.style.opacity = "";
    };
  }
  backdrop.style.opacity = "0";
  panel.style.opacity = "0";
  const a1 = animate(backdrop, {
    opacity: [0, 1],
    duration: 240,
    ease: "outQuad",
  });
  const a2 = animate(panel, {
    opacity: [0, 1],
    translateY: [14, 0],
    duration: 360,
    ease: "outCubic",
  });
  return () => {
    a1.revert();
    a2.revert();
    backdrop.style.opacity = "";
    panel.style.opacity = "";
    panel.style.translate = "";
  };
}

/** Fecha overlay + painel antes de remover do DOM (resolve via Promise.then). */
export function runOverlayExitThen(
  backdrop: HTMLElement,
  panel: HTMLElement,
  onDone: () => void,
): void {
  if (prefersReducedMotion()) {
    onDone();
    return;
  }
  Promise.all([
    animate(backdrop, {
      opacity: [1, 0],
      duration: 190,
      ease: "inQuad",
    }).then(),
    animate(panel, {
      opacity: [1, 0],
      translateY: [0, 10],
      duration: 210,
      ease: "inCubic",
    }).then(),
  ]).then(onDone);
}

/**
 * Overlay de “a entrar” no login: fundo, cartão central e pontos em loop.
 */
export function runLoginLoadingScreen(
  overlay: HTMLElement,
  panel: HTMLElement,
  dots: HTMLElement[],
): () => void {
  const reduced = prefersReducedMotion();
  if (reduced) {
    overlay.style.opacity = "1";
    panel.style.opacity = "1";
    return () => {
      overlay.style.opacity = "";
      panel.style.opacity = "";
    };
  }

  overlay.style.opacity = "0";
  overlay.style.pointerEvents = "auto";
  panel.style.opacity = "0";

  const aBackdrop = animate(overlay, {
    opacity: [0, 1],
    duration: 280,
    ease: "outQuad",
  });

  const aPanel = animate(panel, {
    opacity: [0, 1],
    translateY: [14, 0],
    duration: 400,
    ease: "outCubic",
    delay: 50,
  });

  let dotsLoop: JSAnimation | null = null;
  const raf = requestAnimationFrame(() => {
    if (dots.length === 0) return;
    dotsLoop = animate(dots, {
      scale: [1, 1.22],
      opacity: [0.45, 1],
      duration: 520,
      ease: "inOutSine",
      loop: true,
      alternate: true,
      delay: stagger(110, { start: 180 }),
    });
  });

  return () => {
    cancelAnimationFrame(raf);
    aBackdrop.revert();
    aPanel.revert();
    dotsLoop?.revert();
    overlay.style.opacity = "";
    overlay.style.pointerEvents = "";
    panel.style.opacity = "";
    panel.style.translate = "";
    dots.forEach((d) => {
      d.style.scale = "";
      d.style.opacity = "";
    });
  };
}

/** Rotação contínua linear (indicador “spinner” no botão de entrar). */
export function runSubmitButtonSpinner(el: HTMLElement): () => void {
  if (prefersReducedMotion()) return () => {};
  const anim = animate(el, {
    rotate: [0, 360],
    duration: 650,
    ease: "linear",
    loop: true,
  });
  return () => {
    anim.revert();
    el.style.rotate = "";
  };
}

/** Toast flutuante (ex.: PDV): entrada suave. */
export function runFloatingProgressToastEnter(el: HTMLElement): () => void {
  if (prefersReducedMotion()) {
    el.style.opacity = "1";
    return () => {
      el.style.opacity = "";
    };
  }
  el.style.opacity = "0";
  const anim = animate(el, {
    opacity: [0, 1],
    translateY: [-18, 0],
    duration: 420,
    ease: "outCubic",
  });
  return () => {
    anim.revert();
    el.style.opacity = "";
    el.style.translate = "";
  };
}

/** Saída do toast antes de remover do DOM. */
export function runFloatingProgressToastExitThen(
  el: HTMLElement,
  onDone: () => void,
): void {
  if (prefersReducedMotion()) {
    onDone();
    return;
  }
  animate(el, {
    opacity: [1, 0],
    translateY: [0, -14],
    duration: 280,
    ease: "inCubic",
  }).then(onDone);
}

/**
 * Barra de progresso horizontal (origin à esquerda).
 * Resolve quando o preenchimento termina (ou logo em reduced motion).
 */
export function runProgressBarFill(
  fillEl: HTMLElement,
  options?: { duration?: number },
): { finished: Promise<void>; cancel: () => void } {
  const duration = options?.duration ?? 2000;
  fillEl.style.transformOrigin = "left center";

  if (prefersReducedMotion()) {
    fillEl.style.scale = "1 1";
    return {
      finished: Promise.resolve(),
      cancel: () => {
        fillEl.style.scale = "";
        fillEl.style.transformOrigin = "";
      },
    };
  }

  const anim = animate(fillEl, {
    scaleX: [0, 1],
    duration,
    ease: "outQuart",
  });

  return {
    finished: anim.then(),
    cancel: () => {
      anim.revert();
      fillEl.style.scale = "";
      fillEl.style.transformOrigin = "";
    },
  };
}
