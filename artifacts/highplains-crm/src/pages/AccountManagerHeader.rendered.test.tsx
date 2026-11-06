import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";

for (const file of ["CustomerDetail.tsx"]) {
  const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
  const fragment = source.match(/<p[^>]*data-testid="customer-account-manager">[\s\S]*?<\/p>/)?.[0];
  if (!fragment) throw new Error(`The production quiet manager line is missing in ${file}`);
  // Render the actual production JSX so neither header can silently omit the line.
  const component = new Function("React", "t", "accountManagers", "customer",
    transformSync(`return (${fragment});`, { loader: "tsx", target: "es2022", jsx: "transform" }).code);
  describe(`${file} quiet localized header`, () => {
    it.each(["en", "es"])("renders resolved and unassigned values without using a raw stored ID in %s", language => {
      const t = i18n.getFixedT(language);
      const render = (value: unknown) => renderToStaticMarkup(component(React, t, value, { id: "synthetic", accountManagerId: "stale-raw-id" }));
      const assigned = render({ data: { assignments: { synthetic: { id: "am", name: "Synthetic Manager" } } }, isError: false });
      expect(assigned).toContain(language === "en" ? "Account manager" : "Gerente de cuentas");
      expect(assigned).toContain("Synthetic Manager"); expect(assigned).not.toContain("stale-raw-id");
      expect(render({ data: { assignments: { synthetic: null } }, isError: false })).toContain(t("accountManagers.notAssigned"));
      expect(render({ data: undefined, isError: false })).toContain("—");
      expect(render({ data: { assignments: { synthetic: { name: "Stale" } } }, isError: true })).not.toContain("Stale");
    });
  });
}
