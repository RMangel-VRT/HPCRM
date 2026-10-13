import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaymentEditor } from "./PaymentEditor";
import { applyPreset, blankLine } from "./paymentDraft";

const render = (p: object) => renderToStaticMarkup(<PaymentEditor lines={[]} onChange={() => {}} startMonth={10} {...p} />);
describe("PaymentEditor", () => {
  it("hides the editor for snow-only time and materials", () => {
    const html = render({ line: "snow", snowPricing: "time_and_materials" });
    expect(html).toContain("Billed time and materials, invoiced monthly, net 30");
    expect(html).not.toContain("payment-line-0");
  });
  it("lists months from the start month with percentages and total", () => {
    const l = applyPreset(blankLine("Grounds maintenance", { total: "11750", pickerOpen: true }), "msi", 10);
    const html = render({ lines: [l] });
    expect(html.indexOf("cell-0-10")).toBeLessThan(html.indexOf("cell-0-9"));
    expect(html).toContain("5.0%"); expect(html).toContain("10.0%"); expect(html).toContain("$11,750");
    expect(html).toContain("button-preset-msi-0"); expect(html).not.toContain("button-preset-flatSnow-0");
  });
  it("shows the amber mismatch warning and flat snow only for the Snow line", () => {
    const l = { ...applyPreset(blankLine("Snow", { total: "1000", pickerOpen: true }), "equal12", 1), total: "2000" };
    const html = render({ lines: [l], flatSnowAllowed: true });
    expect(html).toContain("Months add up to $1,000, not $2,000"); expect(html).toContain("button-preset-flatSnow-0");
  });
  it("is read-only in the renew window", () => {
    expect(render({ readOnly: true, lines: [blankLine("A")] })).not.toContain("button-add-line");
  });
});
