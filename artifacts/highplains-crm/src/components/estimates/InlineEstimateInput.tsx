import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Keep an uncommitted keystroke or a newer submission when an older write settles. */
export function InlineInput(props: {
  value: string; disabled: boolean; label: string; testId: string; className?: string; inputMode?: "decimal" | "text";
  placeholder?: string; maxLength?: number; inputRef?: (input: HTMLInputElement | null) => void;
  validate: (raw: string) => { value: unknown; same: boolean } | { error: string };
  onCommit: (v: unknown) => Promise<boolean>; onInvalid: (msg: string) => void;
}) {
  const { value, disabled } = props;
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);
  const revision = useRef(0);
  const authoritative = useRef(value);
  authoritative.current = value;
  useEffect(() => { if (!dirty.current) setDraft(value); }, [value]);

  async function commit(raw: string) {
    if (!dirty.current || disabled) return;
    dirty.current = false;
    if (raw === value) return;
    const parsed = props.validate(raw);
    if ("error" in parsed) { setDraft(value); props.onInvalid(parsed.error); return; }
    if (parsed.same) { setDraft(value); return; }
    const submitted = revision.current;
    if (!await props.onCommit(parsed.value) && revision.current === submitted && !dirty.current) setDraft(authoritative.current);
  }
  return (
    <Input id={props.testId} ref={props.inputRef} value={draft} readOnly={disabled} disabled={disabled} aria-label={props.label} inputMode={props.inputMode}
      placeholder={props.placeholder} maxLength={props.maxLength} onChange={e => {
        dirty.current = true; revision.current++; setDraft(e.target.value);
      }} onBlur={e => void commit(e.currentTarget.value)} onKeyDown={e => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { dirty.current = false; revision.current++; setDraft(value); }
      }} className={cn("h-8 disabled:cursor-default disabled:opacity-100", props.className)} data-testid={props.testId} />
  );
}
