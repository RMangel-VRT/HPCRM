import { beforeEach, describe, expect, it, vi } from "vitest";
import { guardLinkClick, hrefToPath, unsavedGuard } from "./unsavedGuard";

const click = (href: string, extra: Record<string, unknown> = {}) => {
  const a = { getAttribute: (n: string) => (n === "href" ? href : null), hasAttribute: () => false };
  const e = { target: { closest: () => a }, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra };
  guardLinkClick(e as never);
  return e;
};
beforeEach(() => { unsavedGuard.setDirty(false); vi.stubGlobal("window", { location: { origin: "https://crm.test", href: "https://crm.test/" } }); });

describe("unsaved navigation guard", () => {
  it("lets links through when nothing is unsaved", () => {
    expect(click("/dashboard/customers").preventDefault).not.toHaveBeenCalled();
  });
  it("blocks in-app and same-origin absolute links and records the target", () => {
    unsavedGuard.setDirty(true);
    expect(click("/dashboard/customers").preventDefault).toHaveBeenCalled();
    expect(unsavedGuard.getPending()).toBe("/dashboard/customers");
    click("https://crm.test/dashboard/revenue?x=1");
    expect(unsavedGuard.getPending()).toBe("/dashboard/revenue?x=1");
  });
  it("ignores external, hash and modified clicks", () => {
    unsavedGuard.setDirty(true);
    expect(click("https://other.test/x").preventDefault).not.toHaveBeenCalled();
    expect(click("#term-1").preventDefault).not.toHaveBeenCalled();
    expect(click("/a", { metaKey: true }).preventDefault).not.toHaveBeenCalled();
  });
  it("clears the pending target when edits are discarded", () => {
    unsavedGuard.setDirty(true); click("/x"); unsavedGuard.setDirty(false);
    expect(unsavedGuard.getPending()).toBeNull();
    expect(hrefToPath("/x")).toBe("/x");
  });
});
