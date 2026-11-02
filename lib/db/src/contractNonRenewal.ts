/** Driver-free outcome rules shared by the API and CRM. Dates are Colorado calendar days. */
export const NON_RENEWAL_REASONS = ["competitor", "price", "service", "board", "sold_or_self", "our_choice", "other"] as const;
export type NonRenewalReason = typeof NON_RENEWAL_REASONS[number];
export const NON_RENEWAL_LABELS = {
  en: { competitor: "Lost to another contractor", price: "Price", service: "Service concerns", board: "Board decision",
    sold_or_self: "Property sold / self-managing", our_choice: "We chose not to renew", other: "Other" },
  es: { competitor: "Perdido ante otro contratista", price: "Precio", service: "Problemas con el servicio", board: "Decisión de la junta",
    sold_or_self: "Propiedad vendida / autogestión", our_choice: "Decidimos no renovar", other: "Otro" },
} as const;
export const NON_RENEWAL_CONFLICT = "This contract is marked not renewing; undo that first";
export interface NonRenewalFacts {
  nonRenewalOn?: string | null;
  nonRenewalReason?: string | null;
  nonRenewalCompetitor?: string | null;
  nonRenewalNote?: string | null;
  nonRenewalBy?: string | null;
  nonRenewalByName?: string | null;
  deactivateCustomerOnEnd?: boolean;
}
export function isNotRenewing(term: NonRenewalFacts | null | undefined): boolean {
  return !!term?.nonRenewalOn;
}
export function hasOpenBusiness(term: { status: string; endDate: string }, today: string): boolean {
  return ["draft", "sent"].includes(term.status) ||
    (["signed", "active", "renewed"].includes(term.status) && term.endDate >= today);
}
