---
name: Estimate pricing selection
description: Why pricing must not revive an older term or use Contract Center's display fallback.
---

Choose the governing eligible term before exact-key lookup. Missing negotiated
keys fall back to the active card, not an older agreement; display-only fallback
terms must never supply estimate prices.

**Why:** The estimate brief deliberately distinguishes a current agreement's
pricing intent from the board's need to display draft/future/expired seasons.
An older negotiated price must not silently survive a newer governing term.

**How to apply:** Keep Contract Center display behavior unchanged. Across
overlapping eligible agreements use the lifecycle ordering after term-owned
service-line applicability. For a key absent from the active card, the agreed
implementation chooses the latest eligible term across lines before lookup;
see `docs/estimate-setup.md` for this explicit deterministic convention.

The builder's rates-context label describes the governing term, not the price
source of an arbitrary resolved row. Preserve separate contexts when service
lines have different governing terms.

**Why:** A term can govern while its absent exact key legitimately falls back
to the card. Calling that whole context "Rate Card" conceals the governing
agreement; showing one season across distinct contexts is equally misleading.

**How to apply:** Consume the explicit read metadata and keep per-line source
badges independent; see `docs/estimate-builder-screen.md`.
