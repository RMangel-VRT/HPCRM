import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Router } from "wouter";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import CustomerHeader, { type CustomerHeaderProps } from "@/components/customer/header/CustomerHeader";

/* CP3: the account manager moved from a quiet <p> into the shared header's Account manager chip. */
const base: CustomerHeaderProps = {
  customer: { id: "synthetic", name: "Synthetic Place" }, kind: "regular", pages: ["dashboard"], switcherCustomers: [],
  accountManager: { status: "loading" }, canEdit: false,
  actions: { note: false, ticket: false, proposal: false, logCommunication: false },
  onAddNote: () => {}, onAddProposal: () => {}, onLogCommunication: () => {},
};

describe("CustomerHeader account manager chip", () => {
  it.each(["en", "es"])("renders resolved, unassigned and failed values without raw IDs in %s", async language => {
    await i18n.changeLanguage(language);
    const t = i18n.getFixedT(language);
    const render = (accountManager: CustomerHeaderProps["accountManager"]) => renderToStaticMarkup(
      <I18nextProvider i18n={i18n}><Router ssrPath="/dashboard/customers/synthetic"><CustomerHeader {...base} accountManager={accountManager} /></Router></I18nextProvider>);
    const assigned = render({ status: "ready", value: "Synthetic Manager" });
    expect(assigned).toContain(t("accountManagers.label"));
    expect(assigned).toContain("Synthetic Manager");
    expect(assigned).not.toContain("stale-raw-id");
    expect(render({ status: "ready", value: null })).toContain(t("accountManagers.notAssigned"));
    const failed = render({ status: "error" });
    expect(failed).toContain(t("cp3.unavailable"));
    expect(failed).not.toContain("Synthetic Manager");
  });
});
