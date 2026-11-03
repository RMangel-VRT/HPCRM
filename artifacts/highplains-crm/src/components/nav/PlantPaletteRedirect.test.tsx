// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router, Route, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/i18n";
import { PlantPaletteRedirect } from "./QueryPreservingRedirect";
import { PLANT_LIBRARY_PATH } from "./estimatesRail";
import en from "@/i18n/locales/en";
import es from "@/i18n/locales/es";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
afterEach(async () => { cleanup(); toast.mockReset(); await i18n.changeLanguage("en"); });

describe("retired palette bookmarks", () => {
  it.each(["en", "es"])("redirects once with a localized notice in %s, retaining raw query values", async language => {
    await i18n.changeLanguage(language);
    const search = "customerId=one&filter=a%26b%3Dc%23d&repeat=1&repeat=2";
    const loc = memoryLocation({ path: `${PLANT_LIBRARY_PATH}/palettes/old`, record: true });
    render(<StrictMode><Router hook={loc.hook} searchHook={() => search}><Switch>
      <Route path={`${PLANT_LIBRARY_PATH}/palettes/:id`} component={PlantPaletteRedirect} />
      <Route path={PLANT_LIBRARY_PATH}><p>Library destination</p></Route>
    </Switch></Router></StrictMode>);
    await waitFor(() => expect(loc.history.at(-1)).toBe(`${PLANT_LIBRARY_PATH}?${search}`));
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith({ description: (language === "en" ? en : es).paletteRetirement.redirectNotice });
    // Landing on the destination or rendering it again never repeats the notice.
    expect(screen.queryByText("Plant Palette")).toBeNull();
  });
});
