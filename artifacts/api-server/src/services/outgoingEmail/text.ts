export function normalizeEmailText(value?: string | null): string {
  return (value ?? "").replace(/[\s\u0085]+/gu, " ").trim();
}

export function greetingFor(name?: string | null): string {
  const clean = normalizeEmailText(name);
  return clean ? `Hello ${clean},` : "Hello,";
}
