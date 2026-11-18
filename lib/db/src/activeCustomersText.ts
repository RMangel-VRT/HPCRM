/** Driver-free wording shared by the page and server documents. */
export const activeCustomersText = {
  en: {
    cols: { customer: "Customer", agent: "Agent", landscape: "Landscape", snow: "Snow", flags: "Flags", action: "Action" },
    status: { active: "Active", prospect: "Prospect", inactive: "Inactive" },
    flag: { ending_soon: "Ending soon", should_fall_off: "Should fall off", lapsed: "Renewal out", starting_soon: "Starting soon", mismatch: "Inactive but in effect", noContract: "No contract" },
    state: { in_effect: "In effect to {{date}}", starting: "Starts {{date}}", ended: "Ended {{date}}" },
    note: { not_renewing: "not renewing", renewed: "renewed", renewal_sent: "renewal sent", renewal_drafted: "renewal drafted", lost: "lost" },
    pdf: {
      download: "Download PDF", busy: "Preparing PDF…", tooltip: "Full report as of {{date}}",
      failed: "Unable to download the PDF. Please try again.",
      title: "Active Customers", subtitle: "Customers with a contract in effect · as of {{date}}",
      active: "Active (contract in effect)", landscape: "With landscape", snow: "With snow", attention: "Needs attention",
      management: "Management", issue: "Issue", detail: "Detail", inactive: "No longer active", lastTerm: "Last term", note: "Note",
      status: "CRM status: {{status}}", lapsed: "Lapsed {{date}}", lapsedIssue: "Lapsed", mismatch: "Status mismatch",
      stopped: "Stopped early (term ran to {{date}})", empty: "None.",
      footer: "High Plains Property Maintenance · Active customers as of {{date}}", page: "Page {{page}} of {{total}}",
      endingDetail: "Contract ending within 30 days: {{terms}}.",
      lapsedDetail: "Contract ended with renewal pending: {{terms}}.",
      fallOffDetail: "CRM status is active; no contract is in effect or starting.",
      mismatchDetail: "CRM status is inactive; a contract is in effect.",
      noContractDetail: "No contract on file.", inactiveNote: "CRM status is inactive; no contract is in effect.",
      renewed: "Renewed", renewal_drafted: "Renewal drafted", renewal_sent: "Renewal sent", not_renewing: "Not renewing", lost: "Lost",
    },
  },
  es: {
    cols: { customer: "Cliente", agent: "Agente", landscape: "Paisajismo", snow: "Nieve", flags: "Alertas", action: "Acción" },
    status: { active: "Activo", prospect: "Prospecto", inactive: "Inactivo" },
    flag: { ending_soon: "Termina pronto", should_fall_off: "Dar de baja", lapsed: "Renovación pendiente", starting_soon: "Inicia pronto", mismatch: "Inactivo pero vigente", noContract: "Sin contrato" },
    state: { in_effect: "Vigente hasta {{date}}", starting: "Inicia {{date}}", ended: "Terminó {{date}}" },
    note: { not_renewing: "no renueva", renewed: "renovado", renewal_sent: "renovación enviada", renewal_drafted: "renovación en borrador", lost: "perdido" },
    pdf: {
      download: "Descargar PDF", busy: "Preparando PDF…", tooltip: "Informe completo al {{date}}",
      failed: "No se pudo descargar el PDF. Inténtelo de nuevo.",
      title: "Clientes activos", subtitle: "Clientes con un contrato vigente · al {{date}}",
      active: "Activos (contrato vigente)", landscape: "Con paisajismo", snow: "Con nieve", attention: "Requieren atención",
      management: "Administración", issue: "Problema", detail: "Detalle", inactive: "Ya no activos", lastTerm: "Último período", note: "Nota",
      status: "Estado CRM: {{status}}", lapsed: "Venció {{date}}", lapsedIssue: "Vencido", mismatch: "Estado discrepante",
      stopped: "Terminó anticipadamente (período hasta {{date}})", empty: "Ninguno.",
      footer: "High Plains Property Maintenance · Clientes activos al {{date}}", page: "Página {{page}} de {{total}}",
      endingDetail: "Contrato que termina en 30 días: {{terms}}.",
      lapsedDetail: "Contrato terminado con renovación pendiente: {{terms}}.",
      fallOffDetail: "El estado CRM es activo; no hay contrato vigente ni próximo.",
      mismatchDetail: "El estado CRM es inactivo; hay un contrato vigente.",
      noContractDetail: "No hay contrato registrado.", inactiveNote: "El estado CRM es inactivo; no hay contrato vigente.",
      renewed: "Renovado", renewal_drafted: "Renovación en borrador", renewal_sent: "Renovación enviada", not_renewing: "No renueva", lost: "Perdido",
    },
  },
} as const;
export type ActiveCustomersLocale = "en" | "es";
export function activeCustomersLocale(value: unknown): ActiveCustomersLocale {
  return typeof value === "string" && /^es(?:-|$)/i.test(value) ? "es" : "en";
}
export const reportDate = (value: string | null, locale: ActiveCustomersLocale, long = false) => value
  ? new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    timeZone: "UTC", month: long ? "long" : "short", day: "numeric", year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`)) : "—";
export const reportText = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key] ?? ""));
