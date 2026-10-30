"""Deterministic pixel statistics comparing a reference and a render.

This is evidence packaging only; it does not decide visual acceptance.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps


def load(path: Path, size: tuple[int, int]) -> np.ndarray:
    image = Image.open(path).convert("RGB").resize(size, Image.Resampling.LANCZOS)
    return np.asarray(image, dtype=np.float64) / 255.0


def stats(rgb: np.ndarray) -> dict:
    luma = rgb @ np.array([0.2126, 0.7152, 0.0722])
    saturation = rgb.max(axis=2) - rgb.min(axis=2)
    warm = (rgb[..., 0] > rgb[..., 2] * 1.25) & (rgb[..., 0] > 0.04)
    # Edge density on luminance; a coarse proxy for architectural linework.
    gray = Image.fromarray(np.clip(luma * 255, 0, 255).astype(np.uint8))
    edges = np.asarray(gray.filter(ImageFilter.FIND_EDGES), dtype=np.float64) / 255.0
    return {
        "meanRgb": np.round(rgb.mean(axis=(0, 1)), 4).tolist(),
        "medianRgb": np.round(np.median(rgb, axis=(0, 1)), 4).tolist(),
        "p90Rgb": np.round(np.percentile(rgb, 90, axis=(0, 1)), 4).tolist(),
        "p99Rgb": np.round(np.percentile(rgb, 99, axis=(0, 1)), 4).tolist(),
        "meanLuma": round(float(luma.mean()), 4),
        "medianLuma": round(float(np.median(luma)), 4),
        "meanSaturation": round(float(saturation.mean()), 4),
        "warmPixelFraction": round(float(warm.mean()), 4),
        "edgeDensity": round(float((edges > 0.18).mean()), 4),
        "darkFraction": round(float((luma < 0.06).mean()), 4),
        "highlightFraction": round(float((luma > 0.45).mean()), 4),
    }


def histogram_intersection(a: np.ndarray, b: np.ndarray, bins: int = 16) -> float:
    total = 0.0
    for channel in range(3):
        ha, _ = np.histogram(a[..., channel], bins=bins, range=(0.0, 1.0), density=False)
        hb, _ = np.histogram(b[..., channel], bins=bins, range=(0.0, 1.0), density=False)
        ha = ha / max(1, ha.sum())
        hb = hb / max(1, hb.sum())
        total += float(np.minimum(ha, hb).sum())
    return round(total / 3.0, 4)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--render", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--width", type=int, default=800)
    parser.add_argument("--height", type=int, default=450)
    args = parser.parse_args()

    size = (args.width, args.height)
    reference = load(args.reference, size)
    render = load(args.render, size)
    delta = np.abs(reference - render)

    result = {
        "reference": str(args.reference),
        "render": str(args.render),
        "comparisonSize": list(size),
        "referenceStats": stats(reference),
        "renderStats": stats(render),
        "meanAbsoluteRgbDelta": np.round(delta.mean(axis=(0, 1)), 4).tolist(),
        "meanAbsoluteLumaDelta": round(
            float((delta @ np.array([0.2126, 0.7152, 0.0722])).mean()), 4
        ),
        "rgbHistogramIntersection": histogram_intersection(reference, render),
        "note": "Deterministic pixel evidence only; semantic acceptance is recorded separately.",
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
