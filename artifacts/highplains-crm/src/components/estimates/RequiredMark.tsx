/** Visual required marker; inputs carry aria-required so the asterisk stays decorative. */
export function RequiredMark() {
  return <span aria-hidden className="ml-0.5 font-semibold text-destructive" data-testid="mark-required">*</span>;
}
