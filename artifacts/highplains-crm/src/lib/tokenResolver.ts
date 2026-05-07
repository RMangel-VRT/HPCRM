export interface TokenContext {
  customerName?: string | null;
  customerStreet?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerZip?: string | null;
  propertyAddress?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

export interface ResolvedTemplate {
  resolved: string;
  unresolvedTokens: string[];
}

const TOKEN_MAP: Record<string, (ctx: TokenContext) => string | undefined | null> = {
  customerName: (ctx) => ctx.customerName,
  customerStreet: (ctx) => ctx.customerStreet,
  customerCity: (ctx) => ctx.customerCity,
  customerState: (ctx) => ctx.customerState,
  customerZip: (ctx) => ctx.customerZip,
  propertyAddress: (ctx) =>
    ctx.propertyAddress ||
    [ctx.customerStreet, ctx.customerCity, ctx.customerState, ctx.customerZip]
      .filter(Boolean)
      .join(", ") ||
    undefined,
  contactName: (ctx) => ctx.contactName,
  contactEmail: (ctx) => ctx.contactEmail,
  contactPhone: (ctx) => ctx.contactPhone,
};

export function resolveTokens(template: string, ctx: TokenContext): ResolvedTemplate {
  const unresolvedTokens: string[] = [];
  const resolved = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const resolver = TOKEN_MAP[key];
    if (!resolver) {
      unresolvedTokens.push(key);
      return match;
    }
    const value = resolver(ctx);
    if (value == null || value === "") {
      unresolvedTokens.push(key);
      return match;
    }
    return value;
  });
  return { resolved, unresolvedTokens };
}

export function highlightUnresolvedTokens(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match) => {
    return `<mark class="bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 rounded px-0.5">${match}</mark>`;
  });
}
