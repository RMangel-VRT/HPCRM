import type { TFunction } from "i18next";

/** CSV values stay canonical; diagnostic prose follows the current UI language. */
export function quickItemCsvMessage(message: string, t: TFunction) {
  const exact: Record<string, string> = {
    "Expected seven columns": "columns",
    "Kind must be service, equipment or fee": "kind",
    "Services require a category; equipment and fees must have a blank category": "category",
    "Active must be true/false, yes/no or 1/0": "active",
    "Malformed CSV quoting": "quoting",
    "Unterminated quoted field": "unterminated",
    "Unable to save row": "save",
    "New or reassigned services require an active category": "inactive",
    "Category changed; try importing this row again": "categoryChanged",
    "Invalid dollar amount (use nonnegative dollars with at most two decimal places)": "price",
    "Dollar amount exceeds the supported maximum": "priceMax",
    "CSV file or text required": "file",
    "CSV exceeds the 5 MB upload limit": "fileSize",
    "Invalid CSV upload": "upload",
    "X-Company-Id is required for CSV requests": "companyRequired",
    "Choose catalog scope: services or equipment-fees": "scope",
    "Active company changed. Reload and try again.": "companyChanged",
  };
  if (exact[message]) return t(`quickItemCsv.errors.${exact[message]}`);
  if (message.startsWith("CSV must contain exactly these headers:")) return t("quickItemCsv.errors.headers");
  if (message.startsWith("Kind ") && message.endsWith(" is not allowed in this catalog")) return t("quickItemCsv.errors.scopeKind");
  if (message.startsWith("Unknown unit: ")) return t("quickItemCsv.errors.unit", { value: message.slice(14) });
  if (message.startsWith("Unknown posts_to: ")) return t("quickItemCsv.errors.umbrella", { value: message.slice(18) });
  const collision = message.match(/^Name already belongs to another kind \((.*)\)$/);
  if (collision) return t("quickItemCsv.errors.collision", { kind: t(`equipmentFees.kind.${collision[1]}`, { defaultValue: collision[1] }) });
  const unknownExport = message.match(/^Cannot export "([\s\S]*)": unknown unit "([\s\S]*)"\. Resolve it before a roundtrip export\.$/);
  if (unknownExport) return t("quickItemCsv.errors.exportUnit", { name: unknownExport[1], value: unknownExport[2] });
  const invalidExport = message.match(/^Cannot export "([\s\S]*)": missing category or unknown posts_to$/);
  if (invalidExport) return t("quickItemCsv.errors.exportInvalid", { name: invalidExport[1] });
  // The only string-schema failures are trimmed names/category lengths.
  if (message.startsWith("label: ")) return t("quickItemCsv.errors.name");
  if (message.startsWith("category: ")) return t("quickItemCsv.errors.categoryLength");
  return message;
}
