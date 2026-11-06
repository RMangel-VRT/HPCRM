import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, useSearch, Link } from "wouter";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import type { Customer, Contact, Note, InsertNote, Ticket, ProposalWithDetails, PropertyManagementCompany, PropertyManager } from "@shared/schema";
import { insertNoteSchema } from "@shared/schema";
import { CustomerContracts } from "@/components/contracts/CustomerContracts";
import { useCustomerContractSummary, openSnowTriggerFlagCount } from "@/hooks/useCustomerContractSummary";
import { useCustomerServices } from "@/hooks/useCustomerServices";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Edit, Plus, Users, MessageSquare, Copy, Mail, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
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
import TicketListView from "@/components/TicketListView";
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
  const notesQuery = useQuery<Note[]>({
    queryKey: ["/api/customers", id, "notes", ...scope.scope],
    queryFn: ({ signal }) => scope.getJson<Note[]>(`/api/customers/${id}/notes`, signal),
    enabled: !!id && scope.enabled && (activeTab === "notes" || activeTab === "dashboard"),
  });
  const notes = notesQuery.data ?? [];
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
  const needsPm = !!customer && !isParent && (!!customer.propertyManagementCompanyId || !!customer.propertyManagerId);
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
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const noteForm = useForm<Omit<InsertNote, "companyId" | "customerId" | "authorId">>({
    resolver: zodResolver(insertNoteSchema.omit({ companyId: true, customerId: true, authorId: true })),
    defaultValues: { body: "" },
  });
  const onNoteError = (error: Error) => toast({ title: t("common.error"), description: extractApiErrorMessage(error) ?? error.message, variant: "destructive" });
  const createNoteMutation = useMutation({
    mutationFn: async (data: Omit<InsertNote, "companyId" | "customerId" | "authorId">) => apiRequest("POST", `/api/customers/${id}/notes`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", id, "notes"] });
      toast({ title: t("common.success"), description: t("customerDetail.noteCreated") });
      setIsAddNoteDialogOpen(false);
      noteForm.reset();
    },
    onError: onNoteError,
  });
  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, data }: { noteId: string; data: Omit<InsertNote, "companyId" | "customerId" | "authorId"> }) => apiRequest("PATCH", `/api/notes/${noteId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", id, "notes"] });
      toast({ title: t("common.success"), description: t("customerDetail.noteUpdated") });
      setEditingNote(null);
      noteForm.reset();
    },
    onError: onNoteError,
  });
  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => apiRequest("DELETE", `/api/notes/${noteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", id, "notes"] });
      toast({ title: t("common.success"), description: t("customerDetail.noteDeleted") });
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

  const sortedNotes = [...notes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
        return <div className="space-y-4" data-testid="contacts-page">
          <div className="flex justify-end gap-2">
            {contacts.length > 0 && contacts.some(c => c.emails && c.emails.length > 0) && (
              <Button 
                size="sm"
                variant="outline"
                onClick={() => {
                  const allEmails = contacts
                    .flatMap(c => c.emails || [])
                    .filter(Boolean);
                  if (allEmails.length > 0) {
                    navigator.clipboard.writeText(allEmails.join(", "));
                    toast({
                      title: t("common.success"),
                      description: `${allEmails.length} email${allEmails.length > 1 ? 's' : ''}`,
                    });
                  }
                }}
                data-testid="button-copy-all-emails"
              >
                <Mail className="w-4 h-4 mr-2" />
                {t("common.email")}
              </Button>
            )}
            {canEditCustomer && (
              <Button size="sm" asChild>
                <Link href={`/dashboard/customers/${customer.id}/edit#contacts`} data-testid="button-edit-contacts">
                  <Edit className="w-4 h-4 mr-2" />
                  {t("customerEdit.editContacts")}
                </Link>
              </Button>
            )}
          </div>
          {isLoadingContacts ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center p-12">
                <div className="text-center">
                  <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">{t("customerDetail.noContacts")}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {contacts.map((contact) => (
                <Card key={contact.id} data-testid={`card-contact-${contact.id}`}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{contact.name}</p>
                        {contact.isPrimary === "true" && (
                          <Badge variant="secondary" className="text-xs">{t("customerDetail.isPrimary")}</Badge>
                        )}
                      </div>
                      {contact.role && (
                        <p className="text-sm text-muted-foreground">{contact.role}</p>
                      )}
                      {contact.phones && contact.phones.length > 0 && (
                        <div className="text-sm text-muted-foreground">
                          {contact.phones.map((phone: string, idx: number) => (
                            <span key={idx}>{phone}{idx < contact.phones!.length - 1 ? ", " : ""}</span>
                          ))}
                        </div>
                      )}
                      {contact.emails && contact.emails.length > 0 && (
                        <div className="text-sm text-muted-foreground flex items-center flex-wrap gap-x-2">
                          {contact.emails.map((email: string, idx: number) => (
                            <span key={idx} className="inline-flex items-center gap-1">
                              {email}
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground p-0.5 rounded hover-elevate"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(email);
                                  toast({
                                    title: t("common.success"),
                                    description: t("common.email"),
                                  });
                                }}
                                data-testid={`button-copy-email-${contact.id}-${idx}`}
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              {idx < contact.emails!.length - 1 && ","}
                            </span>
                          ))}
                        </div>
                      )}
                      {contact.notes && (
                        <p className="text-sm text-muted-foreground mt-2">{contact.notes}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>;
      case "notes":
        return <div className="space-y-4" data-testid="notes-page">
          <div className="flex justify-end">
            <Button 
              size="sm"
              onClick={() => {
                noteForm.reset({ body: "" });
                setEditingNote(null);
                setIsAddNoteDialogOpen(true);
              }}
              data-testid="button-add-note-tab"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("customerDetail.addNote")}
            </Button>
          </div>
          {isLoadingNotes ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : sortedNotes.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center p-12">
                <div className="text-center">
                  <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">{t("customerDetail.noNotes")}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sortedNotes.map((note) => (
                <Card key={note.id} data-testid={`card-note-${note.id}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start gap-4 mb-2">
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <p className="text-sm font-medium">{t("customerPages.pages.notes")}</p>
                          <p className="text-xs text-muted-foreground" data-testid={`text-note-date-${note.id}`}>
                            {format(new Date(note.createdAt), "MMM d, yyyy")}
                          </p>
                        </div>
                        <p className="text-sm" data-testid={`text-note-body-${note.id}`}>{note.body}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => {
                            setEditingNote(note);
                            noteForm.reset({
                              body: note.body,
                            });
                          }}
                          data-testid={`button-edit-note-${note.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              data-testid={`button-delete-note-${note.id}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("common.delete")} {t("customerPages.pages.notes")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("ticketDetail.cannotUndo")}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteNoteMutation.mutate(note.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {t("common.delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>;
      case "communications":
        return <CommunicationListTab queryKey={["/api/customers", customer.id, "communications"]} customerId={customer.id} />;
      case "services":
        return <ServicesPage customerId={customer.id} />;
      case "tickets":
        return isParent ? <ParentTicketsPage customer={customer} /> : (
          <TicketListView customerId={customer.id} showHeader={false} showCustomerColumn={false}
            showBatchActions={false} showQuickAdd={false} showNewTicketButton={true} />
        );
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
          actions={{ note: true, ticket: isPrivilegedUser && !isParent, proposal: isPrivilegedUser && !isParent, logCommunication: isPrivilegedUser }}
          onAddNote={openNoteDialog} onAddProposal={() => createProposal.mutate()} proposalPending={createProposal.isPending}
          onLogCommunication={() => setIsLogCommOpen(true)} />

        {!isParent && activeTab !== "dashboard" && <FinishSetupBanner customerId={customer.id} status={customer.status} />}

        <CustomerPageChips pages={pages} activeTab={activeTab} onTabChange={setActiveTab} badges={badges} />

        <section aria-labelledby="customer-page-heading" className="space-y-4">
          <h2 id="customer-page-heading" className="text-xl font-semibold tracking-tight" data-testid="text-customer-page-heading">{pageLabel}</h2>
          {renderPage()}
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
