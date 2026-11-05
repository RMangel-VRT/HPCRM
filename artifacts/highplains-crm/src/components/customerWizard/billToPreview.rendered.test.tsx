// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { resolveBillTo } from "@workspace/customer-billing";
import { draftFromServer } from "./wizardModel";
import { draftToBilling, liveMissing, parentToBilling, useBillToPreview, type PreviewInput } from "./billToPreview";

afterEach(cleanup);
const property = { id: "child", companyId: "co", name: "Property", street: "1 Pine", city: "Denver", state: "CO", zip: "80202", status: "prospect" };
const draft = () => draftFromServer(property, [], { edit: true });
const input = (): PreviewInput => ({ draft: draft(), id: "child", companyId: "co", rawBillingName: null, parents: [], pmCompanies: [], ready: true });

describe("live bill-to resolver parity", () => {
  it("uses management-company c/o and follows live directory changes without a row-count change", async () => {
    const props = input();
    props.draft = { ...props.draft, billToMode: "management_company", propertyManagementCompanyId: "pm" };
    props.pmCompanies = [{ id: "pm", name: "Front Range", street: "10 Bill", city: "Golden", state: "CO", zip: "80401" }];
    const { result, rerender } = renderHook((p: PreviewInput) => useBillToPreview(p), { initialProps: props });
    await waitFor(() => expect(result.current.state).toBe("ok"));
    expect(result.current).toMatchObject({ billTo: { name: "Property", lines: ["c/o Front Range", "10 Bill", "Golden, CO 80401"] } });
    rerender({ ...props, pmCompanies: [{ ...props.pmCompanies[0], street: "20 New Bill" }] });
    await waitFor(() => expect(result.current).toMatchObject({ billTo: { street2: "20 New Bill" } }));
    rerender({ ...props, pmCompanies: [{ ...props.pmCompanies[0], zip: "" }] });
    await waitFor(() => expect(result.current.state).toBe("incomplete"));
  });
  it("inherits a master's billing facts, reflects same-size parent updates, and reports activation gaps", async () => {
    const props = input();
    props.draft = { ...props.draft, parentCustomerId: "parent" };
    props.parents = [{ ...property, id: "parent", name: "Master", isParent: "true", branchBillingMode: "master", billingName: "Master AP", billingEmails: ["ap@example.test"], street: "2 Master" }];
    const { result, rerender } = renderHook((p: PreviewInput) => useBillToPreview(p), { initialProps: props });
    await waitFor(() => expect(result.current.state).toBe("ok"));
    expect(result.current).toMatchObject({ billTo: { name: "Master AP", street: "2 Master" } });
    expect(liveMissing(props.draft, null, result.current)).toEqual([]);
    const parent = parentToBilling(props.parents[0], "co");
    const authoritative = await resolveBillTo(draftToBilling(props.draft, "child", "co", null), {
      companyId: "co", getCustomerById: async () => parent, getPropertyManagementCompanyById: async () => undefined,
    });
    expect(result.current.state === "ok" && result.current.billTo).toEqual(authoritative);
    rerender({ ...props, parents: [{ ...props.parents[0], billingEmails: [], street: "" }] });
    await waitFor(() => expect(result.current.state).toBe("incomplete"));
    expect(liveMissing(props.draft, null, result.current)).toEqual(["billingEmails", "billTo"]);
    rerender({ ...props, parents: [{ ...props.parents[0], branchBillingMode: "separate" }] });
    await waitFor(() => expect(result.current).toMatchObject({ billTo: { name: "Property", street: "1 Pine" }, viaParent: null }));
  });
  it("fails explicitly for unavailable or cross-company parents and incomplete custom addresses", async () => {
    const props = input();
    props.draft = { ...props.draft, parentCustomerId: "missing" };
    const { result, rerender } = renderHook((p: PreviewInput) => useBillToPreview(p), { initialProps: props });
    await waitFor(() => expect(result.current.state).toBe("incomplete"));
    rerender({ ...props, parents: [{ ...property, id: "missing", companyId: "foreign", isParent: "true", branchBillingMode: "master" }] });
    await waitFor(() => expect(result.current.state).toBe("incomplete"));
    rerender({ ...props, draft: { ...props.draft, parentCustomerId: null, billToMode: "custom", billStreet: "1 Bill", billCity: "", billState: "CO", billZip: "80202" } });
    await waitFor(() => expect(result.current.state).toBe("incomplete"));
  });
});
