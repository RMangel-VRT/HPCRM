/** Fixed cadence after each completed batch; a slow batch never overlaps another. */
export function startMailboxPolling(run: (stopped: () => boolean) => Promise<void>): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const tick = async () => {
    if (stopped) return;
    try {
      await run(() => stopped);
    } finally {
      if (!stopped) timer = setTimeout(tick, 60_000);
    }
  };
  timer = setTimeout(tick, 30_000);
  return () => { stopped = true; clearTimeout(timer); };
}
