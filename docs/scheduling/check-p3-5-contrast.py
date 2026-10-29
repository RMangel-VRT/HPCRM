#!/usr/bin/env python3
"""WCAG text contrast for composed board colors, including worst-case crew colors."""
import colorsys
import itertools
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
css = (ROOT / "artifacts/highplains-crm/src/index.css").read_text()
light, dark = css.split(".dark {", 1)


def tokens(source):
    return {
        key: colorsys.hls_to_rgb(float(h) / 360, float(l) / 100, float(s) / 100)
        for key, h, s, l in re.findall(r"--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%", source)
    }


def mix(a, b, weight):
    return tuple(x * weight + y * (1 - weight) for x, y in zip(a, b))


def luminance(rgb):
    linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    return sum(c * w for c, w in zip(linear, (.2126, .7152, .0722)))


def contrast(a, b):
    low, high = sorted((luminance(a), luminance(b)))
    return (high + .05) / (low + .05)


results = {}
for theme, source, alpha, crew_alpha in (("light", light, .10, .07), ("dark", dark, .14, .06)):
    t = tokens(source)
    fg, bg = t["foreground"], t["background"]
    text = {
        "ok": mix(fg, t["muted-foreground"], .70),
        "amber": mix(t["warning"], fg, .55),
        "red": mix(fg, t["destructive"], .80),
    }
    ratios = {key: [] for key in text}
    hints = []
    # RGB cube corners bound all sRGB crew colors: composition is channel-wise
    # monotone. Include both ordinary crew tint and stronger active-target tint.
    for crew in itertools.product((0, 1), repeat=3):
        for strength in (crew_alpha, .18):
            surface = mix(t["primary"], mix(crew, bg, strength), alpha)
            for key, color in text.items():
                ratios[key].append(contrast(color, surface))
            hint = fg if strength == .18 else mix(t["muted-foreground"], fg, .75)
            hints.append(contrast(hint, surface))
    results[theme] = {
        **{f"today-capacity-{key}-minimum": round(min(values), 4) for key, values in ratios.items()},
        "today-hint-minimum": round(min(hints), 4),
        "card-text": round(contrast(t["card-foreground"], t["card"]), 4),
        "card-muted-text": round(contrast(mix(t["muted-foreground"], fg, .85), t["card"]), 4),
        "today-pill": round(contrast(t["primary-foreground"], t["primary"]), 4),
    }
    for label, ratio in results[theme].items():
        assert ratio >= 4.5, f"{theme} {label}: {ratio} < 4.5"

destination = ROOT / "docs/scheduling/P3-5-contrast.json"
destination.write_text(json.dumps(results, indent=2) + "\n")
print(json.dumps(results, indent=2))
