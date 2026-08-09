"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  getPublicLoginBranding,
  type LoginBrandingPublic,
} from "@/lib/api-client";
import {
  DEFAULT_LOGIN_BG,
  loginBackgroundDisplayUrl,
} from "@/lib/login-branding";

const FALLBACK_BRANDING: LoginBrandingPublic = {
  backgroundUrl: "",
  overlayOpacity: 70,
  updatedAt: "",
};

export function LoginBackground() {
  const [branding, setBranding] =
    useState<LoginBrandingPublic>(FALLBACK_BRANDING);
  const [bgVisible, setBgVisible] = useState(true);
  const [imgSrc, setImgSrc] = useState(DEFAULT_LOGIN_BG);

  useEffect(() => {
    let cancelled = false;
    void getPublicLoginBranding()
      .then((data) => {
        if (cancelled) return;
        setBranding(data);
        setImgSrc(
          loginBackgroundDisplayUrl(data.backgroundUrl, data.updatedAt),
        );
        setBgVisible(true);
      })
      .catch(() => {
        /* mantém imagem predefinida */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const overlayStrength = branding.overlayOpacity / 100;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {bgVisible ? (
        <div className="absolute inset-0">
          <div className="relative h-full min-h-svh w-full">
            <Image
              src={imgSrc}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-[88%_center] opacity-90 dark:opacity-100"
              unoptimized
              onError={() => setBgVisible(false)}
            />
          </div>
        </div>
      ) : null}
      <div
        className="absolute inset-0"
        style={{ opacity: overlayStrength }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/85 via-white/70 to-zinc-100/80 dark:from-black/70 dark:via-black/50 dark:to-black/75" />
        <div className="absolute inset-0 bg-gradient-to-t from-white/50 via-transparent to-white/30 dark:from-black/60 dark:via-transparent dark:to-black/40" />
      </div>
    </div>
  );
}
