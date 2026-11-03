import { vi } from "vitest";

export type Handler = (url: string, init: RequestInit & { headers?: Record<string, string> }) => { status?: number; body?: unknown } | undefined;
export interface Call { url: string; method: string; headers: Record<string, string>; body: unknown }

/** Mocked transport for CQ4 rendered tests. No network, no QuickBooks. */
export function installFetch(handler: Handler) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url, method: init.method ?? "GET", headers, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const r = handler(url, init as never) ?? { status: 404, body: { message: "not mocked" } };
    const status = r.status ?? 200;
    const text = r.body === undefined ? "" : JSON.stringify(r.body);
    return { ok: status < 400, status, statusText: "", text: async () => text, json: async () => r.body } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

/* Minimal DOM matchers (jest-dom is not installed in this workspace). */
import { expect } from "vitest";
const el = (x: unknown) => x as HTMLElement | null;
expect.extend({
  toHaveTextContent(r: unknown, t: string) { const s = el(r)?.textContent ?? ""; return { pass: s.includes(t), message: () => `expected "${s}" to contain "${t}"` }; },
  toHaveAttribute(r: unknown, n: string, v?: string) { const a = el(r)?.getAttribute(n); return { pass: v === undefined ? a !== null && a !== undefined : a === v, message: () => `expected ${n}=${v}, got ${a}` }; },
  toBeDisabled(r: unknown) { return { pass: !!(el(r) as HTMLButtonElement | null)?.disabled, message: () => "expected disabled" }; },
  toBeEnabled(r: unknown) { return { pass: !!el(r) && !(el(r) as HTMLButtonElement).disabled, message: () => "expected enabled" }; },
  toBeInTheDocument(r: unknown) { return { pass: !!el(r) && document.body.contains(el(r)), message: () => "expected in document" }; },
});
declare module "vitest" {
  interface Assertion<T = any> { // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    toHaveTextContent(t: string): void; toHaveAttribute(n: string, v?: string): void;
    toBeDisabled(): void; toBeEnabled(): void; toBeInTheDocument(): void;
  }
}
