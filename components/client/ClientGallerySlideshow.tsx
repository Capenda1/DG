"use client";

/* eslint-disable @next/next/no-img-element -- imagens servidas pela API */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clientGalleryImageUrl,
  listClientGalleryItems,
  type ClientGalleryItem,
} from "@/lib/api-client";

const AUTO_MS = 6000;
const TRANSITION_MS = 520;

function padIndex(n: number, total: number) {
  return String(n + 1).padStart(2, "0") + " / " + String(total).padStart(2, "0");
}

export function ClientGallerySlideshow() {
  const [items, setItems] = useState<ClientGalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const directionRef = useRef<1 | -1>(1);
  const touchStartX = useRef<number | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const rows = await listClientGalleryItems();
      setItems(rows);
      setIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar a galeria.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const count = items.length;

  const goTo = useCallback(
    (next: number, dir: 1 | -1 = 1) => {
      if (count <= 1 || transitioning) return;
      const normalized = (next + count) % count;
      if (normalized === index) return;

      directionRef.current = dir;
      setTransitioning(true);
      window.setTimeout(() => {
        setIndex(normalized);
        setTransitioning(false);
      }, TRANSITION_MS);
    },
    [count, index, transitioning],
  );

  const goNext = useCallback(() => goTo(index + 1, 1), [goTo, index]);
  const goPrev = useCallback(() => goTo(index - 1, -1), [goTo, index]);

  useEffect(() => {
    if (count <= 1 || paused || transitioning) return;
    const t = window.setInterval(goNext, AUTO_MS);
    return () => window.clearInterval(t);
  }, [count, goNext, index, paused, transitioning]);

  useEffect(() => {
    const strip = filmstripRef.current;
    if (!strip) return;
    const active = strip.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [index]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    const delta = end - start;
    if (Math.abs(delta) < 48) return;
    if (delta < 0) goNext();
    else goPrev();
  };

  if (loading) {
    return (
      <section aria-label="Galeria" className="gallery-showcase">
        <div className="gallery-showcase__header">
          <div>
            <p className="gallery-showcase__eyebrow">Inspiração Dádiva</p>
            <h2 className="gallery-showcase__title">Galeria creativa</h2>
          </div>
        </div>
        <div className="gallery-showcase__frame">
          <div className="gallery-showcase__stage gallery-showcase__stage--loading">
            <div className="gallery-showcase__shimmer" aria-hidden />
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section
        className="rounded-2xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-[12px] text-red-200"
        role="alert"
      >
        {error}
      </section>
    );
  }

  if (count === 0) return null;

  const current = items[index];
  const imageUrl = clientGalleryImageUrl(current.imageKey);
  const slideShift = transitioning
    ? directionRef.current === 1
      ? "-8px"
      : "8px"
    : "0px";

  return (
    <section
      aria-label="Galeria de inspiração"
      className="gallery-showcase"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="gallery-showcase__header">
        <div className="min-w-0">
          <p className="gallery-showcase__eyebrow">Inspiração Dádiva</p>
          <h2 className="gallery-showcase__title">Galeria creativa</h2>
        </div>
        {count > 1 ? (
          <span className="gallery-showcase__counter tabular-nums" aria-live="polite">
            {padIndex(index, count)}
          </span>
        ) : null}
      </div>

      <div className="gallery-showcase__frame">
        {count > 1 ? (
          <div className="gallery-showcase__progress-track" aria-hidden>
            <div
              key={`progress-${index}-${paused}`}
              className="gallery-showcase__progress-fill gallery-progress-fill"
              style={{
                animationDuration: paused ? "0ms" : `${AUTO_MS}ms`,
                animationPlayState: paused ? "paused" : "running",
              }}
            />
          </div>
        ) : null}

        <div
          className="gallery-showcase__stage"
          style={{
            opacity: transitioning ? 0.72 : 1,
            transform: `translateX(${slideShift}) scale(${transitioning ? 0.992 : 1})`,
            transition: `opacity ${TRANSITION_MS}ms ease, transform ${TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
          }}
        >
          {/* Ambiente desfocado — preenche o palco sem cortar a peça principal */}
          <div className="gallery-showcase__ambient" aria-hidden>
            <img
              key={`ambient-${current.id}`}
              src={imageUrl}
              alt=""
              className="gallery-showcase__ambient-img gallery-ken-burns"
              draggable={false}
            />
            <div className="gallery-showcase__ambient-vignette" />
          </div>

          {/* Imagem principal — object-contain para mostrar a peça completa */}
          <div key={current.id} className="gallery-showcase__hero gallery-stage-in">
            <img
              src={imageUrl}
              alt={current.title}
              className="gallery-showcase__hero-img"
              draggable={false}
            />
          </div>

          <div className="gallery-showcase__grain" aria-hidden />

          {count > 1 ? (
            <>
              <button
                type="button"
                onClick={goPrev}
                aria-label="Imagem anterior"
                className="gallery-showcase__nav gallery-showcase__nav--prev"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M12 4L6 10l6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Próxima imagem"
                className="gallery-showcase__nav gallery-showcase__nav--next"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M8 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          ) : null}
        </div>

        <div key={`caption-${current.id}`} className="gallery-showcase__caption gallery-caption-in">
          <div className="gallery-showcase__caption-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <h3 className="gallery-showcase__caption-title">{current.title}</h3>
            {current.description ? (
              <p className="gallery-showcase__caption-text">{current.description}</p>
            ) : (
              <p className="gallery-showcase__caption-text gallery-showcase__caption-text--muted">
                Peças personalizadas · modelagem · produção
              </p>
            )}
          </div>
        </div>
      </div>

      {count > 1 ? (
        <div className="gallery-showcase__filmstrip" role="tablist" aria-label="Slides da galeria" ref={filmstripRef}>
          {items.map((item, i) => {
            const active = i === index;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={item.title}
                onClick={() => goTo(i, i >= index ? 1 : -1)}
                className={`gallery-showcase__thumb ${active ? "gallery-showcase__thumb--active" : ""}`}
              >
                <img
                  src={clientGalleryImageUrl(item.imageKey)}
                  alt=""
                  className="gallery-showcase__thumb-img"
                  draggable={false}
                />
                <span className="gallery-showcase__thumb-ring" aria-hidden />
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
