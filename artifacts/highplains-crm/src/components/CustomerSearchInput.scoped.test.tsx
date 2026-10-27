// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@/i18n";
import CustomerSearchInput from "./CustomerSearchInput";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockImplementation(async () => ({ ok: true, json: async () => [{ id: "k1", name: "Prairie Ridge HOA" }] }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

const input = () => screen.getByRole("textbox") as HTMLInputElement;
async function type(v: string) { fireEvent.change(input(), { target: { value: v } }); await act(async () => { await vi.advanceTimersByTimeAsync(250); }); }

describe("CustomerSearchInput scoping", () => {
  it("unchanged for existing consumers: no company header", async () => {
    render(<CustomerSearchInput onSelect={() => {}} />);
    await type("pra");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("sends X-Company-Id and aborts + clears on scope change", async () => {
    const { rerender } = render(<CustomerSearchInput onSelect={() => {}} expectedCompanyId="c1" requestScope="u1|c1|admin" />);
    await type("pra");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-Company-Id"]).toBe("c1");
    expect(screen.getByText("Prairie Ridge HOA")).toBeTruthy();
    fireEvent.change(input(), { target: { value: "prai" } });
    rerender(<CustomerSearchInput onSelect={() => {}} expectedCompanyId="c2" requestScope="u1|c2|admin" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(input().value).toBe("");
    expect(screen.queryByText("Prairie Ridge HOA")).toBeNull();
    expect(fetchMock.mock.calls.every(([, i]) => (i as RequestInit).headers && ((i as RequestInit).headers as Record<string, string>)["X-Company-Id"] === "c1")).toBe(true);
  });
  it("aborts in-flight request when scope changes mid-flight", async () => {
    let seen: AbortSignal | undefined;
    fetchMock.mockImplementation((_u: string, i: RequestInit) => { seen = i.signal ?? undefined; return new Promise(() => {}); });
    const { rerender } = render(<CustomerSearchInput onSelect={() => {}} expectedCompanyId="c1" requestScope="a" />);
    await type("pra");
    rerender(<CustomerSearchInput onSelect={() => {}} expectedCompanyId="c2" requestScope="b" />);
    expect(seen?.aborted).toBe(true);
  });
});
