/** Amounts are Jan–Dec, independent of service dates; order contains calendar months 1–12. */
export interface PaymentPattern { amounts: number[]; order: number[] }

export function cycleOrder(startMonth = 1): number[] {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) throw new RangeError("Start month must be 1–12");
  return Array.from({ length: 12 }, (_, i) => (startMonth - 1 + i) % 12 + 1);
}

function pattern(totalCents: number, startMonth: number): PaymentPattern {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > 2147483647) throw new RangeError("Total must be non-negative integer cents");
  return { amounts: Array<number>(12).fill(0), order: cycleOrder(startMonth) };
}

/** Every payment except the last uses floor; the last reconciles all remaining cents. */
export function equal12(totalCents: number, startMonth = 1): PaymentPattern {
  const result = pattern(totalCents, startMonth);
  const each = Math.floor(totalCents / 12);
  for (const month of result.order) result.amounts[month - 1] = each;
  result.amounts[result.order[11] - 1] = totalCents - each * 11;
  return result;
}

/** MSI weights are calendar-indexed even for October-start terms. */
export function msi(totalCents: number, startMonth = 1): PaymentPattern {
  const result = pattern(totalCents, startMonth);
  let allocated = 0;
  result.order.forEach((month, index) => {
    const weight = [11, 12, 1, 2].includes(month) ? 5 : 10;
    const amount = index === 11 ? totalCents - allocated : Math.floor(totalCents * weight / 100);
    result.amounts[month - 1] = amount;
    allocated += amount;
  });
  return result;
}

/** Selected-month presets round each share, then reconcile the last selected cycle month.
 * This deliberately differs from equal12: $2,400 / 7 is $342.86 × 6 + $342.84.
 */
export function equalOver(totalCents: number, months: number[], startMonth = 1): PaymentPattern {
  const result = pattern(totalCents, startMonth);
  if (!months.length || months.some(m => !Number.isInteger(m) || m < 1 || m > 12)) throw new RangeError("Choose at least one valid month");
  const selected = result.order.filter(month => months.includes(month));
  // With tiny totals, cap shares so reconciliation never creates a negative payment.
  const each = Math.min(Math.round(totalCents / selected.length), selected.length > 1 ? Math.floor(totalCents / (selected.length - 1)) : totalCents);
  selected.forEach((month, index) => {
    result.amounts[month - 1] = index === selected.length - 1 ? totalCents - each * index : each;
  });
  return result;
}

export function flatSnow(totalCents: number, startMonth = 1): PaymentPattern {
  return equalOver(totalCents, [12, 1, 2, 3, 4], startMonth);
}
