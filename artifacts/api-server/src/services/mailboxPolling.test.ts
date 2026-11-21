import { expect, it, vi } from "vitest";
import { startMailboxPolling } from "./mailboxPolling";

it("does not overlap a running tick or reschedule after shutdown", async () => {
  vi.useFakeTimers();
  let release!: () => void;
  let stopped: (() => boolean) | undefined;
  const held = new Promise<void>(r => { release = r; });
  const run = vi.fn(async (check: () => boolean) => { stopped = check; await held; });
  const stop = startMailboxPolling(run);
  try {
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(stopped?.()).toBe(false);
    stop();
    expect(stopped?.()).toBe(true);
    release();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    stop();
    vi.useRealTimers();
  }
});
