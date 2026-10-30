import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ where: vi.fn() }));
vi.mock("../db", () => ({ db: { select: () => ({ from: () => ({ where: mocks.where }) }) } }));
import { isInvoiceCenterEnabled } from "./invoiceFeature";
beforeEach(() => vi.resetAllMocks());
it.each([undefined, null, "{}", "null", "[]", "broken", '{"invoiceCenter":"true"}', '{"invoiceCenter":false}', '{"invoiceCenter":1}'])(
  "fails closed for unavailable or malformed flag %s", async featureFlags => {
    mocks.where.mockResolvedValue(featureFlags === undefined ? [] : [{ featureFlags }]);
    expect(await isInvoiceCenterEnabled("company")).toBe(false);
  });
it("requires literal true and fails closed on database failure", async () => {
  mocks.where.mockResolvedValue([{ featureFlags: '{"invoiceCenter":true}' }]);
  expect(await isInvoiceCenterEnabled("company")).toBe(true);
  mocks.where.mockRejectedValue(new Error("private database details"));
  expect(await isInvoiceCenterEnabled("company")).toBe(false);
});
