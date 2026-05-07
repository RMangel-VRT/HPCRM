import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "wouter";
import {
  DollarSign,
  Ticket as TicketIcon,
  Calendar,
  FileText,
  User,
  Clock,
  MapPin,
  Building,
  Users,
  Copy,
  GitBranch,
  Eye,
  ArrowRight,
  Phone,
  Mail,
  MessagesSquare,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import CommunicationsQuickViewModal from "@/components/customer/communications/CommunicationsQuickViewModal";
import LogCommunicationForm from "@/components/customer/communications/LogCommunicationForm";
import { formatDistanceToNow, format, isFuture } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import StatusBadge from "@/components/StatusBadge";
import type {
  Customer,
  Contact,
  Contract,
  Ticket,
  Note,
  ContractMonthlyAmount,
  PropertyManagementCompany,
  PropertyManager,
  CommunicationWithDetails,
  CustomerServicePlan,
} from "@shared/schema";

interface CustomerDashboardProps {
  customerId: string;
  customer: Customer & { childCustomers?: Customer[]; parentCustomer?: Customer | null };
  contacts: Contact[];
  contracts: Contract[];
  tickets: Ticket[];
  notes: Note[];
  pmCompanies: PropertyManagementCompany[];
  pmManagers: PropertyManager[];
  isParentCustomer: boolean;
  childCustomers: Customer[];
  onTabChange: (tab: string) => void;
}

function relativeDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return "";
  }
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function useCopyToClipboard() {
  const { toast } = useToast();
  return (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: `${label} copied` });
    });
  };
}

export default function CustomerDashboard({
  customerId,
  customer,
  contacts,
  contracts,
  tickets,
  notes,
  pmCompanies,
  pmManagers,
  isParentCustomer,
  childCustomers,
  onTabChange,
}: CustomerDashboardProps) {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  const { data: allMonthlyAmounts = [] } = useQuery<{ contractId: string; amounts: ContractMonthlyAmount[] }[]>({
    queryKey: ["/api/customers", customerId, "all-monthly-amounts", currentYear],
  });

  const { data: communications = [] } = useQuery<CommunicationWithDetails[]>({
    queryKey: ["/api/customers", customerId, "communications"],
  });

  const { data: commsSummary } = useQuery<{
    totalCount: number;
    lastContactAt: string | null;
    lastContactDirection: string | null;
    lastContactAddress: string | null;
    recentCount30d: number;
  }>({
    queryKey: ["/api/customers", customerId, "communications", "summary"],
  });

  const [showCommsModal, setShowCommsModal] = useState(false);
  const [showLogCommDialog, setShowLogCommDialog] = useState(false);

  const activeContracts = contracts.filter((c) => c.status === "active");
  const openTickets = tickets.filter((t) => !t.completedAt);
  const highPriorityCount = openTickets.filter((t) => t.priority === "high" || t.priority === "urgent").length;

  const oldestOpenTicket = openTickets.length > 0
    ? openTickets.reduce((oldest, t) => {
        const d = t.createdAt ? new Date(t.createdAt) : new Date();
        const od = oldest.createdAt ? new Date(oldest.createdAt) : new Date();
        return d < od ? t : oldest;
      }, openTickets[0])
    : null;

  const oldestDaysAgo = oldestOpenTicket?.createdAt
    ? Math.floor((Date.now() - new Date(oldestOpenTicket.createdAt).getTime()) / 86400000)
    : null;

  const annualValue = allMonthlyAmounts.reduce((total, ca) => {
    const contract = contracts.find((c) => c.id === ca.contractId && c.status === "active");
    if (!contract) return total;
    return total + ca.amounts.reduce((sum, a) => sum + (a.amount || 0), 0);
  }, 0);

  const upcomingTickets = tickets
    .filter((t) => !t.completedAt && t.dueDate && isFuture(new Date(t.dueDate)))
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  const nextServiceTicket = upcomingTickets[0] ?? null;

  const primaryContact = contacts.find((c) => c.isPrimary === "true") ?? contacts[0] ?? null;

  const activityItems: { title: string; subtitle: string; timestamp: Date; type: string }[] = [
    ...notes.map((n) => ({
      title: "Note",
      subtitle: n.body ? n.body.slice(0, 80) + (n.body.length > 80 ? "…" : "") : "",
      timestamp: new Date(n.createdAt),
      type: "note",
    })),
    ...tickets
      .filter((t) => t.createdAt)
      .map((t) => ({
        title: t.title,
        subtitle: t.completedAt ? "Ticket resolved" : "Ticket opened",
        timestamp: t.completedAt ? new Date(t.completedAt) : new Date(t.createdAt!),
        type: "ticket",
      })),
    ...communications
      .filter((c) => c.status === "sent" && c.createdAt)
      .map((c) => ({
        title: c.subject || "(No subject)",
        subtitle: c.type === "sms" ? "SMS" : c.type === "email" ? "Email" : c.type.charAt(0).toUpperCase() + c.type.slice(1),
        timestamp: c.sentAt ? new Date(c.sentAt) : new Date(c.createdAt),
        type: c.type,
      })),
  ]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 5);

  const pmCompany = customer.propertyManagementCompanyId
    ? pmCompanies.find((c) => c.id === customer.propertyManagementCompanyId)
    : null;
  const pmManager = customer.propertyManagerId
    ? pmManagers.find((m) => m.id === customer.propertyManagerId)
    : null;

  const copy = useCopyToClipboard();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AnnualContractValueCard
          annualValue={annualValue}
          activeContractCount={activeContracts.length}
        />

        <OpenTicketsCard
          openTickets={openTickets}
          highPriorityCount={highPriorityCount}
          oldestDaysAgo={oldestDaysAgo}
          onTabChange={onTabChange}
        />

        <NextServiceCard
          customerId={customerId}
          nextServiceTicket={nextServiceTicket}
          onTabChange={onTabChange}
        />

        <div className="md:col-span-2">
          <ActiveContractsCard
            activeContracts={activeContracts}
            onTabChange={onTabChange}
          />
        </div>

        <PrimaryContactCard
          contact={primaryContact}
          onCopy={copy}
          onTabChange={onTabChange}
        />

        <div className="md:col-span-2">
          <RecentActivityCard
            activityItems={activityItems}
            onTabChange={onTabChange}
          />
        </div>

        <PropertyCard
          customer={customer}
          pmCompany={pmCompany ?? null}
          pmManager={pmManager ?? null}
        />

        <CommunicationsCard
          totalCount={commsSummary?.totalCount ?? 0}
          lastContactAt={commsSummary?.lastContactAt ?? null}
          lastContactDirection={commsSummary?.lastContactDirection ?? null}
          lastContactAddress={commsSummary?.lastContactAddress ?? null}
          recentCount30d={commsSummary?.recentCount30d ?? 0}
          onViewAll={() => setShowCommsModal(true)}
          onLogNew={() => setShowLogCommDialog(true)}
        />
      </div>

      <CommunicationsQuickViewModal
        open={showCommsModal}
        onOpenChange={setShowCommsModal}
        customerId={customerId}
        customerName={customer.name}
        totalCount={commsSummary?.totalCount ?? 0}
        onOpenFullTab={() => { setShowCommsModal(false); onTabChange("communications"); }}
      />

      <Dialog open={showLogCommDialog} onOpenChange={setShowLogCommDialog}>
        <DialogContent className="max-w-xl" data-testid="dialog-log-comm">
          <DialogHeader>
            <DialogTitle>{t("emailTracking.logCommunicationBtn")}</DialogTitle>
          </DialogHeader>
          <LogCommunicationForm
            customerId={customerId}
            onSuccess={() => setShowLogCommDialog(false)}
            onCancel={() => setShowLogCommDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {isParentCustomer && childCustomers.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Child Properties ({childCustomers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {childCustomers.map((child) => (
                    <TableRow key={child.id} data-testid={`row-branch-${child.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                          {child.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" />
                          {child.street}, {child.city}, {child.state}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={child.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild data-testid={`button-view-branch-${child.id}`}>
                          <Link href={`/dashboard/customers/${child.id}`}>
                            <Eye className="w-4 h-4 mr-2" />
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AnnualContractValueCard({
  annualValue,
  activeContractCount,
}: {
  annualValue: number;
  activeContractCount: number;
}) {
  return (
    <Card data-testid="card-annual-contract-value">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Annual Contract Value
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold" data-testid="text-annual-value">
          {annualValue > 0 ? formatCurrency(annualValue) : "—"}
        </p>
        <p className="text-sm text-muted-foreground mt-1" data-testid="text-active-contracts-count">
          {activeContractCount} active {activeContractCount === 1 ? "contract" : "contracts"}
        </p>
      </CardContent>
    </Card>
  );
}

function OpenTicketsCard({
  openTickets,
  highPriorityCount,
  oldestDaysAgo,
  onTabChange,
}: {
  openTickets: Ticket[];
  highPriorityCount: number;
  oldestDaysAgo: number | null;
  onTabChange: (tab: string) => void;
}) {
  const count = openTickets.length;
  return (
    <Card
      className="cursor-pointer hover-elevate"
      onClick={() => onTabChange("operations")}
      data-testid="card-open-tickets"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <TicketIcon className="w-4 h-4" />
          Open Tickets
        </CardTitle>
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <p className="text-sm text-muted-foreground">No open tickets</p>
        ) : (
          <>
            <p
              className={`text-2xl font-semibold ${count > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}
              data-testid="text-open-ticket-count"
            >
              {count}
            </p>
            <p className="text-sm text-muted-foreground mt-1" data-testid="text-ticket-subtitle">
              {highPriorityCount > 0 ? `${highPriorityCount} high priority` : "No high priority"}
              {oldestDaysAgo !== null ? ` · oldest ${oldestDaysAgo}d ago` : ""}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function NextServiceCard({
  customerId,
  nextServiceTicket,
  onTabChange,
}: {
  customerId: string;
  nextServiceTicket: Ticket | null;
  onTabChange: (tab: string) => void;
}) {
  const currentYear = new Date().getFullYear();
  const { data: allServicePlans = [], isLoading } = useQuery<CustomerServicePlan[]>({
    queryKey: ["/api/customers", customerId, "service-plans"],
  });
  const servicePlans = allServicePlans.filter((p) => p.year === currentYear);

  const hasPlans = servicePlans.length > 0;

  return (
    <Card
      className="cursor-pointer hover-elevate"
      onClick={() => onTabChange("fulfillment")}
      data-testid="card-next-service"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Next Service
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : hasPlans ? (
          <div className="space-y-1" data-testid="service-plans-list">
            {servicePlans.slice(0, 3).map((plan) => (
              <div key={plan.id} className="flex items-center justify-between gap-2" data-testid={`service-plan-row-${plan.id}`}>
                <p className="text-sm font-medium truncate">{plan.serviceCategory}</p>
                <span className="text-xs text-muted-foreground shrink-0">×{plan.expectedQuantity}</span>
              </div>
            ))}
            {servicePlans.length > 3 && (
              <p className="text-xs text-muted-foreground" data-testid="text-more-plans">
                +{servicePlans.length - 3} more
              </p>
            )}
          </div>
        ) : !nextServiceTicket ? (
          <p className="text-sm text-muted-foreground">No upcoming services</p>
        ) : (
          <>
            <p className="font-medium text-sm truncate" data-testid="text-next-service-name">
              {nextServiceTicket.title}
            </p>
            <p className="text-sm text-muted-foreground mt-1" data-testid="text-next-service-date">
              {nextServiceTicket.dueDate
                ? format(new Date(nextServiceTicket.dueDate), "MMM d, yyyy")
                : "No date set"}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ActiveContractsCard({
  activeContracts,
  onTabChange,
}: {
  activeContracts: Contract[];
  onTabChange: (tab: string) => void;
}) {
  return (
    <Card data-testid="card-active-contracts">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Active Contracts
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onTabChange("billing")}
          data-testid="button-view-all-contracts"
          className="text-xs"
        >
          View all
          <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </CardHeader>
      <CardContent>
        {activeContracts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active contracts</p>
        ) : (
          <div className="space-y-2">
            {activeContracts.slice(0, 5).map((contract) => (
              <div
                key={contract.id}
                className="flex items-center justify-between gap-2 py-1.5"
                data-testid={`row-contract-${contract.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{contract.serviceType}</p>
                  <p className="text-xs text-muted-foreground">
                    {contract.startDate ? format(new Date(contract.startDate), "MMM yyyy") : "—"}
                    {contract.endDate ? ` – ${format(new Date(contract.endDate), "MMM yyyy")}` : ""}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 shrink-0"
                  data-testid={`badge-contract-status-${contract.id}`}
                >
                  Active
                </Badge>
              </div>
            ))}
            {activeContracts.length > 5 && (
              <p className="text-xs text-muted-foreground pt-1">
                +{activeContracts.length - 5} more
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PrimaryContactCard({
  contact,
  onCopy,
  onTabChange,
}: {
  contact: Contact | null;
  onCopy: (text: string, label: string) => void;
  onTabChange: (tab: string) => void;
}) {
  return (
    <Card data-testid="card-primary-contact">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <User className="w-4 h-4" />
          Primary Contact
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onTabChange("contacts")}
          data-testid="button-view-all-contacts"
          className="text-xs"
        >
          View all
          <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </CardHeader>
      <CardContent>
        {!contact ? (
          <p className="text-sm text-muted-foreground">No contacts on file</p>
        ) : (
          <div className="space-y-2">
            <div>
              <p className="font-medium text-sm" data-testid="text-contact-name">{contact.name}</p>
              {contact.role && (
                <p className="text-xs text-muted-foreground" data-testid="text-contact-role">{contact.role}</p>
              )}
            </div>
            {contact.emails && contact.emails.length > 0 && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs truncate" data-testid="text-contact-email">{contact.emails[0]}</span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-6 h-6 shrink-0"
                  onClick={() => onCopy(contact.emails![0], "Email")}
                  data-testid="button-copy-email"
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            )}
            {contact.phones && contact.phones.length > 0 && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs truncate" data-testid="text-contact-phone">{contact.phones[0]}</span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-6 h-6 shrink-0"
                  onClick={() => onCopy(contact.phones![0], "Phone")}
                  data-testid="button-copy-phone"
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function activityTypeBadge(type: string) {
  if (type === "email") return (
    <Badge
      variant="secondary"
      className="text-xs shrink-0"
      style={{ backgroundColor: "hsl(var(--chart-5) / 0.15)", color: "hsl(var(--chart-5))" }}
      data-testid="badge-type-email"
    >
      Email
    </Badge>
  );
  if (type === "sms") return (
    <Badge
      variant="secondary"
      className="text-xs shrink-0"
      style={{ backgroundColor: "hsl(var(--chart-3) / 0.15)", color: "hsl(var(--chart-3))" }}
      data-testid="badge-type-sms"
    >
      SMS
    </Badge>
  );
  if (type === "ticket") return (
    <Badge
      variant="secondary"
      className="text-xs shrink-0"
      style={{ backgroundColor: "hsl(var(--chart-4) / 0.15)", color: "hsl(var(--chart-4))" }}
      data-testid="badge-type-ticket"
    >
      Ticket
    </Badge>
  );
  if (type === "note") return (
    <Badge
      variant="secondary"
      className="text-xs shrink-0"
      style={{ backgroundColor: "hsl(var(--primary) / 0.15)", color: "hsl(var(--primary))" }}
      data-testid="badge-type-note"
    >
      Note
    </Badge>
  );
  return null;
}

function activityTab(type: string): string {
  if (type === "ticket") return "tickets";
  if (type === "note") return "notes";
  return "communications";
}

function RecentActivityCard({
  activityItems,
  onTabChange,
}: {
  activityItems: { title: string; subtitle: string; timestamp: Date; type: string }[];
  onTabChange: (tab: string) => void;
}) {
  return (
    <Card data-testid="card-recent-activity">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Recent Activity
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onTabChange("communications")}
          data-testid="button-view-all-activity"
          className="text-xs"
        >
          View all
          <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </CardHeader>
      <CardContent>
        {activityItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity</p>
        ) : (
          <div className="space-y-1">
            {activityItems.map((item, idx) => (
              <div
                key={idx}
                role="button"
                tabIndex={0}
                className="flex items-start justify-between gap-2 px-2 py-1.5 rounded-md cursor-pointer hover-elevate"
                onClick={() => onTabChange(activityTab(item.type))}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTabChange(activityTab(item.type)); } }}
                data-testid={`row-activity-${idx}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {activityTypeBadge(item.type)}
                    <p className="text-sm font-medium truncate" data-testid={`text-activity-title-${idx}`}>{item.title}</p>
                  </div>
                  {item.subtitle && (
                    <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap" data-testid={`text-activity-date-${idx}`}>
                  {relativeDate(item.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PropertyCard({
  customer,
  pmCompany,
  pmManager,
}: {
  customer: Customer;
  pmCompany: PropertyManagementCompany | null;
  pmManager: PropertyManager | null;
}) {
  return (
    <Card data-testid="card-property">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Property
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div>
          <p className="text-sm font-medium" data-testid="text-property-address">
            {customer.street || "—"}
          </p>
          <p className="text-sm text-muted-foreground" data-testid="text-property-city-state">
            {[customer.city, customer.state, customer.zip].filter(Boolean).join(", ") || "—"}
          </p>
        </div>
        {(customer.acres || customer.complexityScore) && (
          <>
            <Separator />
            <div className="grid grid-cols-2 gap-2">
              {customer.acres && (
                <div>
                  <p className="text-xs text-muted-foreground">Acres</p>
                  <p className="text-sm font-medium" data-testid="text-property-acres">{customer.acres}</p>
                </div>
              )}
              {customer.complexityScore && (
                <div>
                  <p className="text-xs text-muted-foreground">Complexity</p>
                  <p className="text-sm font-medium" data-testid="text-property-complexity">{customer.complexityScore}</p>
                </div>
              )}
            </div>
          </>
        )}
        {(pmCompany || pmManager) && (
          <>
            <Separator />
            <div className="space-y-1">
              {pmCompany && (
                <div className="flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs truncate" data-testid="text-property-pm-company">{pmCompany.name}</p>
                </div>
              )}
              {pmManager && (
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs truncate" data-testid="text-property-pm-manager">{pmManager.name}</p>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CommunicationsCard({
  totalCount,
  lastContactAt,
  lastContactDirection,
  lastContactAddress,
  recentCount30d,
  onViewAll,
  onLogNew,
}: {
  totalCount: number;
  lastContactAt: string | null;
  lastContactDirection: string | null;
  lastContactAddress: string | null;
  recentCount30d: number;
  onViewAll: () => void;
  onLogNew: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card data-testid="card-communications">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <MessagesSquare className="w-4 h-4" />
          {t("emailTracking.communicationsTitle")}
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={onViewAll}
          data-testid="button-view-all-comms"
          className="text-xs"
        >
          {t("emailTracking.viewAllComms")}
          <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 gap-2 text-center" data-testid="empty-state-communications">
            <MessagesSquare className="w-8 h-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t("emailTracking.communicationsEmptyState")}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-2xl font-semibold" data-testid="text-comm-total-count">{totalCount}</p>
                <p className="text-xs text-muted-foreground">{t("emailTracking.communicationsTotal")}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-medium" data-testid="text-comm-recent-count">{recentCount30d}</p>
                <p className="text-xs text-muted-foreground">{t("emailTracking.communicationsLast30")}</p>
              </div>
            </div>
            {lastContactAt && (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {lastContactDirection === "inbound"
                    ? <ArrowDownLeft className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    : <ArrowUpRight className="w-3.5 h-3.5 text-green-600 shrink-0" />}
                  <span data-testid="text-last-contact">
                    {t("emailTracking.communicationsLastContact")} {formatDistanceToNow(new Date(lastContactAt), { addSuffix: true })}
                  </span>
                </div>
                {lastContactAddress && (
                  <p className="text-xs text-muted-foreground pl-5 truncate" data-testid="text-last-contact-address">
                    {lastContactAddress}
                  </p>
                )}
              </div>
            )}
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onLogNew}
          data-testid="button-log-comm-from-dashboard"
          className="w-full gap-1"
        >
          <Plus className="w-3 h-3" />
          {t("emailTracking.logCommunicationBtn")}
        </Button>
      </CardContent>
    </Card>
  );
}
