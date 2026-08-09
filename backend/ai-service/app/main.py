from __future__ import annotations

import base64
import io
import os
from typing import Annotated

from fastapi import Depends, FastAPI, File, HTTPException, Header, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

def _parse_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def _require_api_key(
    x_api_key: Annotated[str | None, Header(alias="X-Api-Key")] = None,
) -> None:
    expected = os.getenv("AI_SERVICE_API_KEY", "").strip()
    if not expected:
        return
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Chave de API inválida.")


app = FastAPI(
    title="Dádiva Go — AI / imagem",
    version="0.2.0",
    description="Serviço de processamento de imagem e IA para a plataforma Dádiva Go.",
)

cors_origins = _parse_cors_origins()
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-Api-Key"],
    )


# ── Health ───────────────────────────────────────────────────────────────────

@app.get("/health", tags=["infra"])
def health():
    return {"status": "ok", "service": "dadiva-ai-service", "version": "0.2.0"}


@app.get("/", tags=["infra"])
def root():
    return {
        "service": "Dádiva Go AI Service",
        "docs": "/docs",
        "health": "/health",
    }


# ── Mockup preview ────────────────────────────────────────────────────────────

class MockupPreviewRequest(BaseModel):
    garment_color: str = "#FFFFFF"
    art_base64: str | None = None
    width: int = 400
    height: int = 500


class MockupPreviewResponse(BaseModel):
    preview_base64: str
    format: str = "png"
    width: int
    height: int


@app.post(
    "/mockup/preview",
    response_model=MockupPreviewResponse,
    tags=["mockup"],
    dependencies=[Depends(_require_api_key)],
)
def mockup_preview(body: MockupPreviewRequest):
    """
    Gera uma pré-visualização simples de mockup com a cor da peça e a arte posicionada.
    Fase actual: retorna uma imagem placeholder com a cor pedida.
    """
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="Pillow não está instalado. Execute: pip install Pillow",
        )

    img = Image.new("RGBA", (body.width, body.height), color=body.garment_color)
    draw = ImageDraw.Draw(img)

    # Silhueta simplificada (placeholder visual)
    margin = 40
    draw.rectangle(
        [margin, margin, body.width - margin, body.height - margin],
        outline="#00000033",
        width=2,
    )
    draw.text((body.width // 2 - 30, body.height // 2), "mockup", fill="#00000066")

    if body.art_base64:
        try:
            art_bytes = base64.b64decode(body.art_base64)
            art_img = Image.open(io.BytesIO(art_bytes)).convert("RGBA")
            art_img.thumbnail((body.width // 3, body.height // 3))
            paste_x = (body.width - art_img.width) // 2
            paste_y = (body.height - art_img.height) // 2
            img.paste(art_img, (paste_x, paste_y), art_img)
        except Exception:
            pass  # arte inválida — continua sem ela

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    preview_b64 = base64.b64encode(buf.getvalue()).decode()

    return MockupPreviewResponse(
        preview_base64=preview_b64,
        width=body.width,
        height=body.height,
    )


# ── Extracção de cores ────────────────────────────────────────────────────────

class ColorInfo(BaseModel):
    hex: str
    rgb: list[int]
    percentage: float


class ExtractColorsResponse(BaseModel):
    colors: list[ColorInfo]
    total_pixels: int


MAX_UPLOAD_BYTES = 10 * 1024 * 1024


@app.post(
    "/art/extract-colors",
    response_model=ExtractColorsResponse,
    tags=["arte"],
    dependencies=[Depends(_require_api_key)],
)
async def extract_colors(
    file: Annotated[UploadFile, File(description="Imagem da arte (PNG, JPG, WebP)")],
    max_colors: int = 5,
):
    """
    Extrai as cores dominantes de uma imagem de arte enviada via multipart/form-data.
    Devolve as N cores mais frequentes com percentagem de cobertura.
    """
    try:
        from PIL import Image
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="Pillow não está instalado. Execute: pip install Pillow",
        )

    if file.content_type not in ("image/png", "image/jpeg", "image/webp"):
        raise HTTPException(
            status_code=400,
            detail="Formato não suportado. Use PNG, JPEG ou WebP.",
        )

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Ficheiro demasiado grande (máx. 10 MB).")

    img = Image.open(io.BytesIO(contents)).convert("RGB")

    # Reduz para acelerar a contagem
    img.thumbnail((200, 200))
    pixels = list(img.getdata())
    total = len(pixels)

    counts: dict[tuple[int, int, int], int] = {}
    for px in pixels:
        counts[px] = counts.get(px, 0) + 1

    top = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:max_colors]

    colors = [
        ColorInfo(
            hex="#{:02X}{:02X}{:02X}".format(*rgb),
            rgb=list(rgb),
            percentage=round(count / total * 100, 2),
        )
        for rgb, count in top
    ]

    return ExtractColorsResponse(colors=colors, total_pixels=total)
