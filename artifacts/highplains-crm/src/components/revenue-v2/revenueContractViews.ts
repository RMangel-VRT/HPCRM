/** Helpers + EN/ES strings for Monthly billing and By customer. Wire the objects under revenueV2.billing / revenueV2.customers. */

export const exactMoney = (cents: number) => {
  const sign = cents < 0 ? "\u2212" : "";
  return sign + "$" + (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** Internally generated amount: written as a plain decimal number, never formula-escaped. */
export type CsvAmount = { cents: number };
export type CsvValue = string | CsvAmount;
export const csvAmount = (cents: number): CsvAmount => ({ cents });

/** Text cells: neutralise spreadsheet formula prefixes, then quote when needed. Amounts: "-1234.50". */
export function csvCell(value: CsvValue) {
  if (typeof value !== "string") return (value.cents / 100).toFixed(2);
  let s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, rows: CsvValue[][]) {
  const text = "\uFEFF" + rows.map(r => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const monthTitle = (ym: string, lang: string) => {
  const [y, m] = ym.split("-").map(Number);
  const s = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const billingEn = {
  prevMonth: "Previous month",
  nextMonth: "Next month",
  exportCsv: "Export CSV",
  contractBilling: "Contract billing",
  landscape: "Landscape",
  snowFlat: "Snow (flat)",
  fees: "Fees",
  customersBilling: "Customers billing",
  customersSub: "{{count}} agreements",
  ytd: "Year to date",
  ytdSub: "January through {{month}}",
  fullYear: "Full year",
  fullYearSub: "Signed schedule, {{year}}",
  notice: "Contracts only. {{snowTmCount}} snow contracts are time & materials and bill per storm. The Invoiced column fills in once monthly contract invoices are created from the CRM.",
  search: "Search customers, seasons, lines",
  colCustomer: "Customer", colContract: "Contract", colLines: "Payment lines", colAmount: "Amount", colInvoiced: "Invoiced", colFees: "Fees in amount",
  open: "Contract",
  openAria: "Open contract for {{name}}",
  details: "Show schedule for {{name}}",
  total: "Total",
  shown: "{{shown}} of {{total}} customers",
  lineLandscape: "Landscape", lineSnow: "Snow", lineBoth: "Landscape + snow",
  notRenewing: "Not renewing",
  fee: "Fee",
  emptyMonth: "No signed contract bills in {{month}}.",
  emptySearch: "Nothing matches \u201c{{q}}\u201d.",
  clearSearch: "Clear search",
  error: "Monthly billing could not load.",
  retry: "Try again",
  panelTitle: "Payment schedule",
  panelLoading: "Loading seasons",
  panelError: "The contract could not load.",
  openContractCenter: "Open in Contract Center",
  customerBilling: "Customer \u203a Billing",
  noPayments: "No payment rows on this season.",
  seasonTotal: "Season total",
  csvFile: "contract-billing-{{month}}.csv",
};

export const billingEs: typeof billingEn = {
  prevMonth: "Mes anterior",
  nextMonth: "Mes siguiente",
  exportCsv: "Exportar CSV",
  contractBilling: "Facturaci\u00f3n de contratos",
  landscape: "Paisajismo",
  snowFlat: "Nieve (tarifa fija)",
  fees: "Cargos",
  customersBilling: "Clientes que facturan",
  customersSub: "{{count}} acuerdos",
  ytd: "En lo que va del a\u00f1o",
  ytdSub: "Enero hasta {{month}}",
  fullYear: "A\u00f1o completo",
  fullYearSub: "Calendario firmado, {{year}}",
  notice: "Solo contratos. {{snowTmCount}} contratos de nieve son por tiempo y materiales y se facturan por tormenta. La columna Facturado se llenar\u00e1 cuando se creen las facturas mensuales de contratos desde el CRM.",
  search: "Buscar clientes, temporadas, l\u00edneas",
  colCustomer: "Cliente", colContract: "Contrato", colLines: "L\u00edneas de pago", colAmount: "Importe", colInvoiced: "Facturado", colFees: "Cargos incluidos",
  open: "Contrato",
  openAria: "Abrir contrato de {{name}}",
  details: "Ver calendario de {{name}}",
  total: "Total",
  shown: "{{shown}} de {{total}} clientes",
  lineLandscape: "Paisajismo", lineSnow: "Nieve", lineBoth: "Paisajismo + nieve",
  notRenewing: "No renueva",
  fee: "Cargo",
  emptyMonth: "No hay cobros de contratos firmados en {{month}}.",
  emptySearch: "Nada coincide con \u201c{{q}}\u201d.",
  clearSearch: "Borrar b\u00fasqueda",
  error: "No se pudo cargar la facturaci\u00f3n mensual.",
  retry: "Reintentar",
  panelTitle: "Calendario de pagos",
  panelLoading: "Cargando temporadas",
  panelError: "No se pudo cargar el contrato.",
  openContractCenter: "Abrir en Centro de contratos",
  customerBilling: "Cliente \u203a Facturaci\u00f3n",
  noPayments: "Esta temporada no tiene pagos.",
  seasonTotal: "Total de temporada",
  csvFile: "facturacion-contratos-{{month}}.csv",
};

export const customersEn = {
  year: "Year",
  lineFilter: "Line",
  all: "All", contract: "Landscape", snow: "Snow (flat)", fee: "Fees",
  search: "Search customers",
  colCustomer: "Customer", colYear: "Year",
  composition: "Mix",
  total: "Total",
  seasonStarts: "{{season}} season starts",
  shown: "{{shown}} of {{total}} customers",
  scrollRegion: "Contract income by customer and month",
  barLabel: "{{month}}: total {{total}}; landscape {{contract}}, snow {{snow}}, fees {{fee}}",
  cellLabel: "{{name}}, {{month}}: {{amount}}",
  snowEmpty: "No contract uses flat-rate snow today. All {{n}} snow contracts are time & materials and bill per storm.",
  empty: "No signed contract income for {{year}} on this line.",
  snowEmptyGeneric: "No flat-rate snow contract income for {{year}}.",
  emptySearch: "Nothing matches \u201c{{q}}\u201d.",
  reset: "Show all lines",
  clearSearch: "Clear search",
  error: "By-customer figures could not load.",
  retry: "Try again",
  openAria: "Open contract for {{name}}",
};

export const customersEs: typeof customersEn = {
  year: "A\u00f1o",
  lineFilter: "L\u00ednea",
  all: "Todo", contract: "Paisajismo", snow: "Nieve (fija)", fee: "Cargos",
  search: "Buscar clientes",
  colCustomer: "Cliente", colYear: "A\u00f1o",
  composition: "Mezcla",
  total: "Total",
  seasonStarts: "Empieza la temporada {{season}}",
  shown: "{{shown}} de {{total}} clientes",
  scrollRegion: "Ingresos de contratos por cliente y mes",
  barLabel: "{{month}}: total {{total}}; paisajismo {{contract}}, nieve {{snow}}, cargos {{fee}}",
  cellLabel: "{{name}}, {{month}}: {{amount}}",
  snowEmpty: "Ning\u00fan contrato usa nieve de tarifa fija hoy. Los {{n}} contratos de nieve son por tiempo y materiales y se facturan por tormenta.",
  empty: "No hay ingresos de contratos firmados para {{year}} en esta l\u00ednea.",
  snowEmptyGeneric: "No hay ingresos de nieve de tarifa fija para {{year}}.",
  emptySearch: "Nada coincide con \u201c{{q}}\u201d.",
  reset: "Ver todas las l\u00edneas",
  clearSearch: "Borrar b\u00fasqueda",
  error: "No se pudieron cargar las cifras por cliente.",
  retry: "Reintentar",
  openAria: "Abrir contrato de {{name}}",
};
