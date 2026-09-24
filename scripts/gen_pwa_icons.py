#!/usr/bin/env python3
"""Sinh bộ icon PWA cho AllerCare AI — vẽ bằng Pillow, không cần file ngoài.

Xuất vào apps/web/public/:
  icons/icon-192.png, icons/icon-512.png            (any — nền trong suốt, bo góc)
  icons/maskable-192.png, icons/maskable-512.png    (maskable — nền đầy, logo trong vùng an toàn 80%)
  apple-touch-icon.png (180x180, nền đầy cho iOS)
  favicon-32.png, favicon-16.png

Chạy: python3 scripts/gen_pwa_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "apps/web/public"
ICONS = OUT / "icons"
ICONS.mkdir(parents=True, exist_ok=True)

# Màu thương hiệu (design system v2 — trắng + xanh nước biển)
GRAD_TOP = (14, 165, 233)    # #0EA5E9
GRAD_BOTTOM = (2, 132, 199)  # #0284C7
WHITE = (255, 255, 255, 255)


def gradient_fill(size: int) -> Image.Image:
    """Nền gradient chéo 135° từ GRAD_TOP → GRAD_BOTTOM."""
    base = Image.new("RGB", (size, size), GRAD_TOP)
    top = Image.new("RGB", (size, size), GRAD_TOP)
    bottom = Image.new("RGB", (size, size), GRAD_BOTTOM)
    mask = Image.linear_gradient("L").rotate(315, expand=True).resize((size, size))
    return Image.composite(bottom, top, mask)


def draw_wave_logo(img: Image.Image, size: int, logo_ratio: float = 1.0) -> None:
    """Vẽ logo sóng biển + mặt trời (khớp icon.svg) lên ảnh."""
    s = size
    d = ImageDraw.Draw(img)
    k = s * logo_ratio  # vùng vẽ logo

    def u(v: float) -> float:
        """Tọa độ theo hệ 64px của SVG, co giãn theo k."""
        return v / 64 * k

    cx = s / 2
    cy = s / 2
    ox, oy = cx - k / 2, cy - k / 2  # gốc vùng logo

    # Mặt trời
    r = u(8)
    d.ellipse([ox + u(24) - r, oy + u(22) - r, ox + u(24) + r, oy + u(22) + r], fill=WHITE)

    # Hai lớp sóng
    lw = max(2, int(u(3.5)))
    for wave_y, opacity in ((40, 255), (48, 140)):
        color = (255, 255, 255, opacity)
        points = []
        x = 0.0
        while x <= 64:
            # đường sin mô phỏng dáng sóng lên xuống
            y = wave_y + (3.2 * (1 if int(x // 8) % 2 == 0 else -1)) * min(1, (x % 8) / 4 if x % 8 < 4 else (8 - x % 8) / 4)
            points.append((ox + u(x), oy + u(y)))
            x += 1
        d.line(points, fill=color, width=lw, joint="curve")


def rounded_any(size: int) -> Image.Image:
    """Icon 'any': nền gradient bo góc 22%, góc ngoài trong suốt."""
    img = gradient_fill(size).convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    radius = int(size * 0.22)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    draw_wave_logo(out, size, logo_ratio=0.98)
    return out


def maskable(size: int) -> Image.Image:
    """Icon maskable: nền gradient ĐẦY (không trong suốt), logo gọn trong vùng an toàn 80%."""
    img = gradient_fill(size).convert("RGBA")
    draw_wave_logo(img, size, logo_ratio=0.78)
    return img


def apple(size: int = 180) -> Image.Image:
    """iOS apple-touch-icon: nền đầy (không trong suốt — iOS tự bo góc)."""
    img = gradient_fill(size).convert("RGBA")
    draw_wave_logo(img, size, logo_ratio=0.94)
    return img


def main() -> None:
    jobs = {
        ICONS / "icon-192.png": rounded_any(192),
        ICONS / "icon-512.png": rounded_any(512),
        ICONS / "maskable-192.png": maskable(192),
        ICONS / "maskable-512.png": maskable(512),
        OUT / "apple-touch-icon.png": apple(180),
        OUT / "favicon-32.png": rounded_any(32),
        OUT / "favicon-16.png": rounded_any(16),
    }
    for path, img in jobs.items():
        img.save(path, "PNG", optimize=True)
        print(f"  ✓ {path.relative_to(ROOT)} ({img.size[0]}x{img.size[1]})")
    print("Hoàn tất sinh icon PWA.")


if __name__ == "__main__":
    main()
