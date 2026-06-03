from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from api.models import BrandKit, BrandColors, BrandFonts
from api import brand_kits_store

router = APIRouter(prefix="/brand-kits", tags=["brand-kits"])


@router.get("")
def list_kits():
    return [k.model_dump() for k in brand_kits_store.list_kits()]


@router.post("", status_code=201)
async def create_kit(
    name: str = Form(...),
    colors_bg: str = Form(...), colors_card: str = Form(...),
    colors_border: str = Form(...), colors_foreground: str = Form(...),
    colors_muted: str = Form(...), colors_accent: str = Form(...),
    colors_accentLight: str = Form(...),
    fonts_body: str = Form(...), fonts_headline: str = Form(...),
    logo: UploadFile = File(...),
):
    slug = brand_kits_store.slugify(name)
    kit = BrandKit(
        version=1, slug=slug, name=name, logo="logo.png",
        colors=BrandColors(
            bg=colors_bg, card=colors_card, border=colors_border,
            foreground=colors_foreground, muted=colors_muted,
            accent=colors_accent, accentLight=colors_accentLight,
        ),
        fonts=BrandFonts(body=fonts_body, headline=fonts_headline),
    )
    brand_kits_store.save_kit(kit)
    (brand_kits_store.KITS_ROOT / slug / "logo.png").write_bytes(await logo.read())
    return kit.model_dump()


@router.put("/{slug}")
async def update_kit(
    slug: str,
    name: str = Form(...),
    colors_bg: str = Form(...), colors_card: str = Form(...),
    colors_border: str = Form(...), colors_foreground: str = Form(...),
    colors_muted: str = Form(...), colors_accent: str = Form(...),
    colors_accentLight: str = Form(...),
    fonts_body: str = Form(...), fonts_headline: str = Form(...),
    logo: UploadFile | None = File(None),
):
    if brand_kits_store.load_kit(slug) is None:
        raise HTTPException(status_code=404, detail="Kit not found")
    kit = BrandKit(
        version=1, slug=slug, name=name, logo="logo.png",
        colors=BrandColors(
            bg=colors_bg, card=colors_card, border=colors_border,
            foreground=colors_foreground, muted=colors_muted,
            accent=colors_accent, accentLight=colors_accentLight,
        ),
        fonts=BrandFonts(body=fonts_body, headline=fonts_headline),
    )
    brand_kits_store.save_kit(kit)
    if logo is not None:
        (brand_kits_store.KITS_ROOT / slug / "logo.png").write_bytes(await logo.read())
    return kit.model_dump()


@router.delete("/{slug}", status_code=204)
def delete_kit(slug: str):
    if brand_kits_store.load_kit(slug) is None:
        raise HTTPException(status_code=404, detail="Kit not found")
    try:
        brand_kits_store.delete_kit(slug)
    except brand_kits_store.KitInUseError as e:
        raise HTTPException(status_code=409, detail=str(e))
