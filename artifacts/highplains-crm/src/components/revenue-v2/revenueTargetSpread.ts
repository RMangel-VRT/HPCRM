export const TARGET_DOLLARS_MAX = Math.floor(2_147_483_647 / 100);
export function wholeDollars(value: string, max: number): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= max ? parsed : undefined;
}

/** Largest remainders, tied by calendar order. Ignore net credits as weights:
 * the target store cannot represent negative goals. No positive pattern means even. */
export function spreadTarget(annualDollars: number, history: readonly number[]): number[] {
  let weights = Array.from({ length: 12 }, (_, i) => BigInt(Math.max(0, history[i] ?? 0)));
  if (weights.every(n => n === 0n)) weights = Array<bigint>(12).fill(1n);
  const denominator = weights.reduce((total, n) => total + n, 0n);
  const shares = weights.map((weight, index) => {
    const numerator = BigInt(annualDollars) * weight;
    return { index, dollars: Number(numerator / denominator), remainder: numerator % denominator };
  });
  const left = annualDollars - shares.reduce((total, row) => total + row.dollars, 0);
  const ranked = [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const row of ranked.slice(0, left)) row.dollars++;
  return shares.map(row => row.dollars);
}
