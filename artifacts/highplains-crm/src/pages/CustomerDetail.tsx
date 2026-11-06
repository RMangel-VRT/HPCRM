import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, useSearch, Link } from "wouter";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import type { Customer, Contact, InsertNote, Ticket, ProposalWithDetails, PropertyManagementCompany, PropertyManager } from "@shared/schema";
import { insertNoteSchema } from "@shared/schema";
import { CustomerContracts } from "@/components/contracts/CustomerContracts";
import { useCustomerContractSummary, openSnowTriggerFlagCount } from "@/hooks/useCustomerContractSummary";
import { useCustomerServices } from "@/hooks/useCustomerServices";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Edit, Plus, Mail, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { extractApiErrorMessage } from "@/lib/apiError";
import { useAuth } from "@/hooks/use-auth";
import { useAccountManagers } from "@/hooks/use-account-managers";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CustomerSubNav, CustomerPageChips, type CustomerPageBadge } from "@/components/customer/CustomerSubNav";
import {
  CUSTOMER_PAGES, LEGACY_TAB_ALIASES, canonicalCustomerSearch, isPrivilegedRole, resolveView, visibleCustomerPages,
  type CustomerPageKey,
} from "@/components/customer/customerPages";
import CustomerTicketsPage from "@/components/customer/pages/CustomerTicketsPage";
import ContactsPage, { allContactEmails, copyText } from "@/components/customer/pages/ContactsPage";
import NotesPage from "@/components/customer/pages/NotesPage";
import { canWriteNotes, invalidateCustomerNotes, type CustomerNote } from "@/hooks/useCustomerNotes";
import { NARROW_PAGES, PageWidth, SectionTitle, type SectionAction } from "@/components/customer/page";
import CommunicationListTab from "@/components/CommunicationListTab";
import CustomerDashboard from "@/components/customer/dashboard/CustomerDashboard";
import { cardState } from "@/components/qbo/QboCustomerCard";
import { cardKey, qboJson, type QuickBooksCard } from "@/lib/qboReview";
import { FinishSetupBanner, useSetupMissingFields } from "@/components/customerWizard/FinishSetupBanner";
import CustomerHeader from "@/components/customer/header/CustomerHeader";
import LogCommunicationForm from "@/components/customer/communications/LogCommunicationForm";
import { aggregateTerms } from "@/components/customer/dashboard/dashboardModel";
import { useCustomerScope } from "@/lib/customerScope";
import PreviousContractsSection from "@/components/customer/pages/PreviousContractsSection";
import ServicesPage from "@/components/customer/pages/ServicesPage";
import PropertyPage from "@/components/customer/pages/PropertyPage";
import ProposalsPage, { type ProposalsView } from "@/components/customer/pages/ProposalsPage";
import BillingPage, { type BillingView } from "@/components/customer/pages/BillingPage";
import SnowPage from "@/components/customer/pages/SnowPage";
import { BranchesPage, ParentDashboardPage, ParentTicketsPage, useParentRollup } from "@/components/customer/pages/ParentPages";
import { openTicketCount, pendingProposalCount, qboNeedsAttention } from "@/components/customer/customerBadges";
import { recordRecentCustomer, removeRecentCustomer } from "@/lib/last-viewed-customer";

const currentHash = () => (typeof window !== "undefined" ? window.location.hash : "");
const APP_TITLE = "High Plains Property Maintenance";
type DetailCustomer = Customer & { childCustomers?: Customer[]; parentCustomer?: Customer | null };

export default function CustomerDetail() {
  const accountManagers = useAccountManagers();
  const { t } = useTranslation();
  const [, params] = useRoute("/dashboard/customers/:id");
  const [location, navigate] = useLocation();
  const search = useSearch();
  const id = params?.id;
  const { toast } = useToast();
  const { user } = useAuth();
  const accessRole = user?.accessRole ?? null;
  const isPrivilegedUser = isPrivilegedRole(accessRole);
  const canEditCustomer = isPrivilegedUser;

  const searchParams = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const rawTab = searchParams.get("tab") || "dashboard";
  const activeTab: string = LEGACY_TAB_ALIASES[rawTab]?.tab ?? rawTab;
  const rawView = LEGACY_TAB_ALIASES[rawTab]?.view ?? searchParams.get("view") ?? null;

  // Legacy ?tab= aliases canonicalize in place (replace), keeping every other param and the hash.
  useEffect(() => {
    const next = canonicalCustomerSearch(search);
    if (next == null) return;
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    navigate(`${location}?${next}${hash}`, { replace: true });
  }, [search, location, navigate]);

  const setActiveTab = (tab: string) => {
    const next = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    next.set("tab", tab);
    next.delete("view");
    navigate(`${location}?${next.toString()}${currentHash()}`);
  };
  const setView = (view: string) => {
    const next = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    next.set("view", view);
    navigate(`${location}?${next.toString()}${currentHash()}`);
  };

  const { data: customer, isLoading: isLoadingCustomer } = useQuery<DetailCustomer>({
    queryKey: ["/api/customers", id, user?.activeCompanyId, user?.id],
    enabled: !!id && !!user?.activeCompanyId,
    queryFn: async ({ signal }) => (await apiRequest("GET", `/api/customers/${id}`, undefined,
      { headers: { "X-Company-Id": user!.activeCompanyId }, signal })).json(),
  });
  const isParent = customer?.isParent === "true";

  // Every detail read is bound to company + viewer + role and sends X-Company-Id; keys keep the
  // ["/api/customers", id, <resource>] prefix so existing invalidations still match.
  const scope = useCustomerScope();
  const contactsQuery = useQuery<Contact[]>({
    queryKey: ["/api/customers", id, "contacts", ...scope.scope],
    queryFn: ({ signal }) => scope.getJson<Contact[]>(`/api/customers/${id}/contacts`, signal),
    enabled: !!id && scope.enabled && (activeTab === "contacts" || activeTab === "dashboard"),
  });
  const contacts = contactsQuery.data ?? [];
  const isLoadingContacts = contactsQuery.isLoading;
  const notesQuery = useQuery<CustomerNote[]>({
    queryKey: ["/api/customers", id, "notes", ...scope.scope],
    queryFn: ({ signal }) => scope.getJson<CustomerNote[]>(`/api/customers/${id}/notes`, signal),
    enabled: !!id && scope.enabled && (activeTab === "notes" || activeTab === "dashboard"),
  });
  const isLoadingNotes = notesQuery.isLoading;

  const summary = useCustomerContractSummary(customer && !isParent ? id : undefined);
  const services = useCustomerServices(customer && !isParent ? id : undefined);

  const ticketsQuery = useQuery<Ticket[]>({
    queryKey: ["/api/customers", id, "tickets", ...scope.scope],
    queryFn: ({ signal }) => scope.getJson<Ticket[]>(`/api/customers/${id}/tickets`, signal),
    enabled: !!id && scope.enabled && !!customer && !isParent,
  });
  const tickets = ticketsQuery.data ?? [];
  // Open = current status not final, using the company's real ticket statuses (scoped read).
  const { data: ticketStatuses } = useQuery<{ id: string; isFinal?: string | boolean | null }[]>({
    queryKey: ["/api/ticket-type-statuses", user?.activeCompanyId, user?.id, user?.activeRole],
    queryFn: async ({ signal }) => (await apiRequest("GET", "/api/ticket-type-statuses", undefined,
      { headers: { "X-Company-Id": user!.activeCompanyId }, signal })).json(),
    enabled: !!user?.activeCompanyId && !!customer && !isParent,
  });
  const proposalsQuery = useQuery<ProposalWithDetails[]>({
    queryKey: ["/api/customers", id, "proposals", user?.activeCompanyId, user?.id, user?.activeRole],
    queryFn: async ({ signal }) => (await apiRequest("GET", `/api/customers/${id}/proposals`, undefined,
      { headers: { "X-Company-Id": user!.activeCompanyId }, signal })).json(),
    enabled: !!id && !!user?.activeCompanyId && isPrivilegedUser && !!customer && !isParent,
  });
  const customerProposals = proposalsQuery.data ?? [];
  const qboCard = useQuery<QuickBooksCard>({
    queryKey: cardKey(id ?? "", user),
    queryFn: () => qboJson("GET", `/api/customers/${encodeURIComponent(id!)}/quickbooks-card`, user?.activeCompanyId),
    enabled: !!id && !!user?.activeCompanyId && isPrivilegedUser,
  });

  // Header "Managed by" chip appears on every regular/branch page.
  const needsPm = !!customer && !isParent && (!!customer.propertyManagementCompanyId || !!customer.propertyManagerId || (activeTab === "contacts" && contacts.some(c => !!c.propertyManagerId)));
  const pmCompaniesQuery = useQuery<PropertyManagementCompany[]>({
    queryKey: ["/api/property-management-companies", ...scope.scope], enabled: needsPm && scope.enabled,
    queryFn: ({ signal }) => scope.getJson<PropertyManagementCompany[]>("/api/property-management-companies", signal),
  });
  const pmManagersQuery = useQuery<PropertyManager[]>({
    queryKey: ["/api/property-managers", ...scope.scope], enabled: needsPm && scope.enabled,
    queryFn: ({ signal }) => scope.getJson<PropertyManager[]>("/api/property-managers", signal),
  });
  const pmCompanies = pmCompaniesQuery.data ?? [];
  const pmManagers = pmManagersQuery.data ?? [];
  const setup = useSetupMissingFields(customer && !isParent ? customer.id : undefined, customer?.status);
  const parentRollup = useParentRollup(isParent ? id : undefined);

  const { data: customersResult } = useQuery<{ customers: Customer[]; total: number }>({
    queryKey: ["/api/customers?page=1&limit=200", ...scope.scope], enabled: scope.enabled,
    queryFn: ({ signal }) => scope.getJson<{ customers: Customer[]; total: number }>("/api/customers?page=1&limit=200", signal),
  });
  const activeCustomersForSwitcher = (customersResult?.customers ?? [])
    .filter((c) => c.active === "true")
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const snowCovered = !!summary.data?.coverage.snow;
  const pages: CustomerPageKey[] = customer
    ? visibleCustomerPages({ kind: isParent ? "parent" : "regular", accessRole, snowCovered })
    : [];
  const pageDef = (CUSTOMER_PAGES as Record<string, (typeof CUSTOMER_PAGES)[CustomerPageKey] | undefined>)[activeTab];
  const snowPending = activeTab === "snow" && !isParent && summary.isLoading;
  const isAllowed = !!pageDef && pages.includes(pageDef.key);
  const pageLabel = isAllowed && pageDef ? t(pageDef.labelKey) : t("customerPages.notAvailable.title");
  const view = pageDef ? resolveView(pageDef.key, rawView) : null;

  const openTickets = isParent ? parentRollup.data?.totals.openTickets ?? 0 : openTicketCount(tickets, ticketStatuses);
  const pendingProposals = pendingProposalCount(customerProposals);
  const qboState = qboCard.data ? cardState(qboCard.data) : null;
  const badges: Partial<Record<CustomerPageKey, CustomerPageBadge>> = {};
  const addBadge = (key: CustomerPageKey, count: number, warning = false) => { if (pages.includes(key) && count > 0) badges[key] = { count, warning }; };
  addBadge("tickets", openTickets);
  if (!isParent) {
    addBadge("services", services.overdueCount, true);
    addBadge("snow", openSnowTriggerFlagCount(summary.data), true);
    addBadge("proposals", pendingProposals);
  }
  addBadge("billing", qboNeedsAttention(qboCard.data, qboState) ? 1 : 0, true);

  useEffect(() => {
    const customerName = customer?.name;
    if (!customerName) return;
    document.title = `${customerName} \u2014 ${pageLabel} | ${APP_TITLE}`;
    return () => { document.title = APP_TITLE; };
  }, [customer?.name, pageLabel]);

  const breadcrumbParent = customer?.parentCustomer ?? null;
  const breadcrumbIsChild = !!customer?.parentCustomerId;
  useSetBreadcrumbs([
    { label: t("customers.title"), href: "/dashboard/customers" },
    ...(breadcrumbIsChild && breadcrumbParent
      ? [{ label: breadcrumbParent.name, href: `/dashboard/customers/${breadcrumbParent.id}?tab=dashboard` }] : []),
    { label: customer?.name || t("common.loading"), href: customer ? `/dashboard/customers/${customer.id}?tab=dashboard` : undefined },
    { label: pageLabel },
  ], [customer?.name, customer?.id, pageLabel, breadcrumbIsChild, breadcrumbParent?.id, breadcrumbParent?.name]);

  // Notes
  const [isAddNoteDialogOpen, setIsAddNoteDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<CustomerNote | null>(null);
  const noteForm = useForm<Omit<InsertNote, "companyId" | "customerId" | "authorId">>({
    resolver: zodResolver(insertNoteSchema.omit({ companyId: true, customerId: true, authorId: true })),
    defaultValues: { body: "" },
  });
  const onNoteError = (error: Error) => toast({ title: t("common.error"), description: extractApiErrorMessage(error) ?? error.message, variant: "destructive" });
  const createNoteMutation = useMutation({
    mutationFn: async (data: Omit<InsertNote, "companyId" | "customerId" | "authorId">) => {
      const started = scope.companyId;
      await scope.request("POST", `/api/customers/${id}/notes`, data);
      scope.assertSameCompany(started);
    },
    onSuccess: () => {
      invalidateCustomerNotes(id!);
      toast({ title: t("common.success"), description: t("customerDetail.noteCreated") });
      setIsAddNoteDialogOpen(false);
      noteForm.reset();
    },
    onError: onNoteError,
  });
  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, data }: { noteId: string; data: Omit<InsertNote, "companyId" | "customerId" | "authorId"> }) => {
      const started = scope.companyId;
      await scope.request("PATCH", `/api/notes/${noteId}`, data);
      scope.assertSameCompany(started);
    },
    onSuccess: () => {
      invalidateCustomerNotes(id!);
      toast({ title: t("common.success"), description: t("customerDetail.noteUpdated") });
      setEditingNote(null);
      noteForm.reset();
    },
    onError: onNoteError,
  });


  const [isLogCommOpen, setIsLogCommOpen] = useState(false);
  const createProposal = useMutation({
    // Same request and destination as the Proposals page's existing New proposal flow.
    mutationFn: async () => {
      const started = scope.companyId;
      const res = await scope.request("POST", "/api/proposals", { customerId: id, title: t("customerPages.pages.proposals"), proposalDate: new Date().toISOString().split("T")[0] });
      const created = await res.json();
      scope.assertSameCompany(started);
      return created as { id: string };
    },
    onSuccess: created => {
      void queryClient.invalidateQueries({ queryKey: ["/api/customers", id, "proposals"] });
      navigate(`/dashboard/tools/proposals/${created.id}`);
    },
    onError: () => toast({ title: t("common.error"), description: t("customerPages.proposals.createFailed"), variant: "destructive" }),
  });

  useEffect(() => {
    if (!id || isLoadingCustomer) return;
    if (!customer) { removeRecentCustomer(user?.activeCompanyId, id); return; }
    if (customer.active === "false") { removeRecentCustomer(user?.activeCompanyId, customer.id); return; }
    if (customer.companyId === user?.activeCompanyId) recordRecentCustomer(user?.activeCompanyId, customer.id);
  }, [id, customer, isLoadingCustomer, user?.activeCompanyId]);

  if (isLoadingCustomer) {
    return (
      <div className="space-y-6 p-6">
        <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-6 w-1/3" /></div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }
  if (!customer) {
    return <div className="flex items-center justify-center h-96"><p className="text-muted-foreground">{t("customers.noCustomersFound")}</p></div>;
  }

  const isChildCustomer = !!customer.parentCustomerId;
  const childCustomers = customer.childCustomers || [];
  const parentCustomer = customer.parentCustomer || null;
  const amLoaded = !!accountManagers.data && !accountManagers.isError;
  const amName = amLoaded ? accountManagers.data!.assignments[customer.id]?.name ?? null : null;
  const qboLoadable = !isPrivilegedUser ? undefined
    : qboCard.isLoading ? { status: "loading" as const } : qboCard.isError ? { status: "error" as const } : { status: "ready" as const, value: qboState };
  const qboAttention = qboNeedsAttention(qboCard.data, qboState);
  const pmCompany = customer.propertyManagementCompanyId ? pmCompanies.find(c => c.id === customer.propertyManagementCompanyId) ?? null : null;
  const pmManager = customer.propertyManagerId ? pmManagers.find(m => m.id === customer.propertyManagerId) ?? null : null;
  // Loading/failed management reads are never shown as "Self-managed".
  const pmPending = needsPm && (pmCompaniesQuery.isLoading || pmManagersQuery.isLoading);
  const pmFailed = needsPm && (!!pmCompaniesQuery.error || !!pmManagersQuery.error);
  const managedBy = pmPending ? { status: "loading" as const } : pmFailed ? { status: "error" as const }
    : { status: "ready" as const, value: pmCompany || pmManager ? { company: pmCompany?.name ?? null, manager: pmManager?.name ?? null } : null };
  const contractLoadable = !isPrivilegedUser ? undefined : isParent
    ? (parentRollup.isLoading ? { status: "loading" as const } : parentRollup.error || !parentRollup.data?.currentTerms ? { status: "error" as const }
      : { status: "ready" as const, value: aggregateTerms(parentRollup.data.currentTerms) })
    : (summary.isLoading ? { status: "loading" as const } : summary.error ? { status: "error" as const }
      : { status: "ready" as const, value: summary.data?.current.length ? aggregateTerms(summary.data.current) : null });

  const openNoteDialog = () => { noteForm.reset({ body: "" }); setEditingNote(null); setIsAddNoteDialogOpen(true); };

  const emailList = allContactEmails(contacts);
  // Server rejects field-role note writes and note creation on parents (assertNotParentCustomer).
  const canAddNote = canWriteNotes(accessRole) && !isParent;
  const titleActions = (): SectionAction[] => {
    switch (activeTab) {
      case "contacts": return [
        ...(emailList.length ? [{ node: (
          <Button size="sm" variant="outline" data-testid="button-copy-all-emails" onClick={async () => {
            const ok = await copyText(emailList.join(", "));
            toast(ok ? { title: t("cp4.contacts.copiedAll", { count: emailList.length }) } : { title: t("cp4.contacts.copyFailed"), variant: "destructive" });
          }}><Mail className="mr-2 h-4 w-4" />{t("cp4.contacts.copyAll")}</Button>) }] : []),
        ...(canEditCustomer ? [{ primary: true, node: (
          <Button size="sm" asChild><Link href={`/dashboard/customers/${customer.id}/edit#contacts`} data-testid="button-edit-contacts">
            <Edit className="mr-2 h-4 w-4" />{t("customerEdit.editContacts")}</Link></Button>) }] : []),
      ];
      case "notes": return canAddNote ? [{ primary: true, node: (
        <Button size="sm" onClick={openNoteDialog} data-testid="button-add-note"><Plus className="mr-2 h-4 w-4" />{t("customerDetail.addNote")}</Button>) }] : [];
      case "communications": return isPrivilegedUser ? [{ node: (
        <Button size="sm" variant="outline" onClick={() => setIsLogCommOpen(true)} data-testid="button-log-new-comm"><Plus className="mr-2 h-4 w-4" />{t("emailTracking.logCommunication")}</Button>) }] : [];
      // New contract is a section-title action (not a header Add action); same admin/office gate as the contract center.
      case "contracts": return isPrivilegedUser ? [{ primary: true, node: (
        <Button size="sm" asChild><Link href={`/dashboard/contracts/new?customerId=${encodeURIComponent(customer.id)}`} data-testid="button-new-contract">
          <Plus className="mr-2 h-4 w-4" />{t("cp1.newContract")}</Link></Button>) }] : [];
      default: return [];
    }
  };

  const renderPage = () => {
    if (snowPending) return <Skeleton className="h-48 w-full" />;
    if (!isAllowed || !pageDef) {
      return (
        <Card data-testid="customer-page-not-available">
          <CardContent className="py-12 text-center space-y-3">
            <Lock className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("customerPages.notAvailable.body")}</p>
            <Button size="sm" variant="outline" onClick={() => setActiveTab("dashboard")} data-testid="button-back-to-dashboard">
              {t("customerPages.notAvailable.back")}
            </Button>
          </CardContent>
        </Card>
      );
    }
    switch (pageDef.key) {
      case "dashboard":
        return isParent
          ? <ParentDashboardPage customer={customer} pages={pages} privileged={isPrivilegedUser}
              qboCard={isPrivilegedUser ? qboCard : undefined} qboState={qboState} qboAttention={qboAttention}
              accountManagerName={amName} accountManagerLoaded={amLoaded} tags={customer.tags ?? []} />
          : <CustomerDashboard customer={customer} pages={pages} privileged={isPrivilegedUser} canEditCustomer={canEditCustomer}
              contacts={contactsQuery} notes={notesQuery} tickets={ticketsQuery} ticketStatuses={ticketStatuses}
              proposals={isPrivilegedUser ? proposalsQuery : undefined} summary={summary} services={services}
              qboCard={isPrivilegedUser ? qboCard : undefined} qboState={qboState} qboAttention={qboAttention}
              setup={setup} snowFlagCount={openSnowTriggerFlagCount(summary.data)}
              accountManagerName={amName} accountManagerLoaded={amLoaded} pmCompany={pmCompany} pmManager={pmManager} management={managedBy} />;
      case "branches":
        return <BranchesPage customer={customer} canManage={isPrivilegedUser} />;
      case "contacts":
        return <ContactsPage contacts={contacts} isLoading={isLoadingContacts} error={contactsQuery.error} onRetry={() => void contactsQuery.refetch()}
          pmManagers={pmManagers} pmCompanies={pmCompanies} />;
      case "notes":
        return <NotesPage customerId={customer.id} notes={notesQuery.data} isLoading={isLoadingNotes} error={notesQuery.error}
          onRetry={() => void notesQuery.refetch()} canWrite={canWriteNotes(accessRole)}
          onEdit={note => { setEditingNote(note); noteForm.reset({ body: note.body }); }} />;
      case "communications":
        return <CommunicationListTab queryKey={["/api/customers", customer.id, "communications"]} customerId={customer.id} showLogButton={false} />;
      case "services":
        return <ServicesPage customerId={customer.id} />;
      case "tickets":
        return isParent ? <ParentTicketsPage customer={customer} /> : <CustomerTicketsPage customerId={customer.id} />;
      case "snow":
        return <SnowPage customerId={customer.id} summary={summary.data} canOpenContract={isPrivilegedUser} />;
      case "property":
        return <PropertyPage customer={customer} canEditLocation={isPrivilegedUser} canEditLayers={isPrivilegedUser} canEditCustomer={canEditCustomer} />;
      case "proposals":
        return <ProposalsPage customerId={customer.id} view={(view ?? "proposals") as ProposalsView} onViewChange={setView} />;
      case "contracts":
        return <div className="space-y-6"><CustomerContracts customerId={customer.id}>{null}</CustomerContracts>
          <PreviousContractsSection customerId={customer.id} /></div>;
      case "billing":
        return <BillingPage customerId={customer.id} isParent={isParent} view={(view ?? "rates") as BillingView} onViewChange={setView} canEditCustomer={canEditCustomer} />;
    }
  };

  return (
    <div className="flex h-full bg-background">
      <CustomerSubNav pages={pages} activeTab={activeTab} onTabChange={setActiveTab} badges={badges} />
      <div className="flex-1 min-w-0 overflow-y-auto space-y-5 p-4 sm:p-6 md:p-8">
        <CustomerHeader
          customer={customer} kind={isParent ? "parent" : isChildCustomer ? "branch" : "regular"} parent={parentCustomer}
          pages={pages} switcherCustomers={activeCustomersForSwitcher}
          contract={contractLoadable} qbo={qboLoadable}
          billingName={isPrivilegedUser ? qboCard.data?.effectiveCustomer?.billingName ?? customer.billingName ?? customer.name : undefined}
          managedBy={managedBy}
          accountManager={accountManagers.isLoading ? { status: "loading" } : !amLoaded ? { status: "error" } : { status: "ready", value: amName }}
          branchCount={parentRollup.data?.children.length ?? childCustomers.length}
          canEdit={canEditCustomer}
          actions={{ note: canAddNote, ticket: isPrivilegedUser && !isParent, proposal: isPrivilegedUser && !isParent, logCommunication: isPrivilegedUser }}
          onAddNote={openNoteDialog} onAddProposal={() => createProposal.mutate()} proposalPending={createProposal.isPending}
          onLogCommunication={() => setIsLogCommOpen(true)} />

        {!isParent && activeTab !== "dashboard" && <FinishSetupBanner customerId={customer.id} status={customer.status} />}

        <CustomerPageChips pages={pages} activeTab={activeTab} onTabChange={setActiveTab} badges={badges} />

        <section aria-labelledby="customer-page-heading" className="space-y-4">
          <PageWidth narrow={(NARROW_PAGES as readonly string[]).includes(activeTab)}>
            <SectionTitle title={pageLabel} actions={isAllowed ? titleActions() : []} />
            {renderPage()}
          </PageWidth>
        </section>

      <Dialog open={isLogCommOpen} onOpenChange={setIsLogCommOpen}>
        <DialogContent className="max-w-xl" data-testid="dialog-log-comm">
          <DialogHeader>
            <DialogTitle>{t("emailTracking.logCommunicationBtn")}</DialogTitle>
            <DialogDescription>{t("cp3.add.logDescription", { name: customer.name })}</DialogDescription>
          </DialogHeader>
          <LogCommunicationForm customerId={customer.id}
            onSuccess={() => { setIsLogCommOpen(false); void queryClient.invalidateQueries({ queryKey: ["/api/customers", customer.id, "dashboard-activity"] }); }}
            onCancel={() => setIsLogCommOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={isAddNoteDialogOpen || !!editingNote} onOpenChange={(open) => {
        if (!open) {
          setIsAddNoteDialogOpen(false);
          setEditingNote(null);
          noteForm.reset();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingNote ? t("customerDetail.editNote") : t("customerDetail.addNote")}</DialogTitle>
            <DialogDescription>
              {editingNote ? t("customerDetail.updateNoteDesc") : t("customerDetail.addNoteDesc")}
            </DialogDescription>
          </DialogHeader>
          <Form {...noteForm}>
            <form onSubmit={noteForm.handleSubmit((data) => {
              if (editingNote) {
                updateNoteMutation.mutate({ noteId: editingNote.id, data });
              } else {
                createNoteMutation.mutate(data);
              }
            })} className="space-y-4">
              <FormField
                control={noteForm.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("customerDetail.noteContent")} *</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t("customerDetail.noteContent")} {...field} rows={5} data-testid="textarea-note-body" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => {
                  setIsAddNoteDialogOpen(false);
                  setEditingNote(null);
                  noteForm.reset();
                }} data-testid="button-cancel-note">
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={createNoteMutation.isPending || updateNoteMutation.isPending} data-testid="button-save-note">
                  {editingNote 
                    ? (updateNoteMutation.isPending ? t("common.saving") : t("common.save"))
                    : (createNoteMutation.isPending ? t("common.creating") : t("common.create"))
                  }
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
