export const WORDING_LIMITS = { subject: 150, preview: 120, eyebrow: 60, headline: 120, intro: 800, closing: 400 } as const;
export type WordingField = keyof typeof WORDING_LIMITS;
export const WORDING_FIELDS = Object.keys(WORDING_LIMITS) as WordingField[];
export type EmailWording = Record<WordingField, string>;

const reminder = ["invoiceNumber", "amountDue", "dueDate", "pastDueText"] as const;
const extras = {
  estimate: ["estimateNumber", "title", "total", "validUntil"],
  estimate_revised: ["estimateNumber", "title", "total", "versionNumber", "previousSentDate"],
  invoice_contract: ["invoiceNumber", "period", "amountDue", "dueDate", "contractName", "paymentOf"],
  invoice_project: ["invoiceNumber", "title", "amountDue", "dueDate", "completedDate"],
  reminder_friendly: reminder, reminder_past_due: reminder, reminder_final: reminder,
  chemical_upcoming: ["treatmentName", "campaignTitle", "plannedDate", "backupDate", "timeWindow"],
  chemical_completed: ["treatmentName", "campaignTitle", "completedDate"],
  work_completed: ["ticketTitle", "completedDate"],
  documents: ["documentCount"],
  general_message: ["subject"],
  contract_renewal: ["contractName", "renewalStart", "renewalTotal"],
  contract_welcome: ["contractName", "startDate"],
} as const;
export type EmailKey = keyof typeof extras;
export const EMAIL_WORDING_KEYS = Object.keys(extras) as EmailKey[];
export const isEmailKey = (key: string): key is EmailKey => Object.hasOwn(extras, key);
const globalTokens = ["customerName", "companyName", "companyPhone", "companyEmail"] as const;
export const PLACEHOLDERS = Object.fromEntries<readonly string[]>(
  Object.entries(extras).map(([key, tokens]) => [key, [...globalTokens, ...tokens]]),
) as Record<EmailKey, readonly string[]>;

type WordingProblem = { code: "required" | "length" | "newline" | "plaintext" | "braces" }
  | { code: "placeholder"; token: string };

/** Shared by the editor and the API so invalid fields are visible before the debounce. */
export function wordingProblem(key: EmailKey, field: WordingField, value: unknown): WordingProblem | null {
  if (typeof value !== "string") return { code: "required" };
  if (/[\r\n\v\f\u0085\u2028\u2029]/u.test(value)) return { code: "newline" };
  if (!value.trim() && !(key === "general_message" && field === "intro")) return { code: "required" };
  if (value.length > WORDING_LIMITS[field]) return { code: "length" };
  if (/[<>\u0000-\u0008\u000e-\u001f\u007f]/u.test(value)
    || /\b(?:https?:\/\/|www\.)/iu.test(value) || /\*\*[^*]+\*\*|__[^_]+__|!?\[[^\]]+\]\([^)]*\)/u.test(value)) {
    return { code: "plaintext" };
  }
  const tokens = /\{([^{}]*)\}/gu;
  if (/[{}]/u.test(value.replace(tokens, ""))) return { code: "braces" };
  for (const [token, name] of value.matchAll(tokens)) {
    if (!PLACEHOLDERS[key].includes(name)) return { code: "placeholder", token };
  }
  return null;
}
