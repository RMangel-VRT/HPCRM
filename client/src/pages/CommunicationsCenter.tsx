import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  MessageSquare,
  FileText,
  Scroll,
  Search,
  Inbox,
  Send,
  Clock,
  UserCheck,
  LayoutTemplate,
  Loader2,
  User,
  Building2,
  CalendarDays,
  Tag,
  Link as LinkIcon,
} from "lucide-react";
import type { Communication, Customer } from "@shared/schema";

type SectionFilter = "all" | "draft" | "sent" | "scheduled" | "follow_ups";

const TYPE_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  note: "Note",
  letter: "Letter",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  scheduled: "Scheduled",
  failed: "Failed",
};

const TYPE_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
  note: FileText,
  letter: Scroll,
};

function TypeBadge({ type }: { type: string }) {
  const Icon = TYPE_ICONS[type] ?? Mail;
  const colorMap: Record<string, string> = {
    email: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    sms: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    note: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
    letter: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${colorMap[type] ?? ""}`}
      data-testid={`badge-type-${type}`}
    >
      <Icon className="w-3 h-3" />
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    sent: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorMap[status] ?? ""}`}
      data-testid={`badge-status-${status}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatDate(date: string | Date | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CommunicationsCenter() {
  const { toast } = useToast();
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useSetBreadcrumbs([{ label: "Communications" }], []);

  const { data: communications = [], isLoading } = useQuery<Communication[]>({
    queryKey: ["/api/communications"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const filteredCommunications = useMemo(() => {
    let items = communications;

    if (sectionFilter === "follow_ups") {
      items = items.filter((c) => c.status === "draft" && c.type === "note");
    } else if (sectionFilter !== "all") {
      items = items.filter((c) => c.status === sectionFilter);
    }

    if (typeFilter !== "all") {
      items = items.filter((c) => c.type === typeFilter);
    }

    if (statusFilter !== "all") {
      items = items.filter((c) => c.status === statusFilter);
    }

    if (customerFilter !== "all") {
      items = items.filter((c) => c.customerId === customerFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (c) =>
          c.subject.toLowerCase().includes(q) ||
          (c.customerName ?? "").toLowerCase().includes(q) ||
          c.body.toLowerCase().includes(q)
      );
    }

    return items;
  }, [communications, sectionFilter, typeFilter, statusFilter, customerFilter, search]);

  const selectedComm = filteredCommunications.find((c) => c.id === selectedId) ??
    communications.find((c) => c.id === selectedId);

  const navSections: { id: SectionFilter; label: string; icon: typeof Inbox; count?: number }[] = [
    { id: "all", label: "All Communications", icon: Inbox, count: communications.length },
    { id: "draft", label: "Drafts", icon: FileText, count: communications.filter((c) => c.status === "draft").length },
    { id: "sent", label: "Sent", icon: Send, count: communications.filter((c) => c.status === "sent").length },
    { id: "scheduled", label: "Scheduled", icon: Clock, count: communications.filter((c) => c.status === "scheduled").length },
    { id: "follow_ups", label: "Follow-Ups", icon: UserCheck, count: communications.filter((c) => c.status === "draft" && c.type === "note").length },
  ];

  return (
    <div className="flex h-full -m-6 md:-m-8 overflow-hidden">
      {/* Left Panel */}
      <aside className="w-56 shrink-0 border-r bg-muted/30 flex flex-col overflow-y-auto">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Folders</h2>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {navSections.map((section) => {
            const Icon = section.icon;
            const isActive = sectionFilter === section.id;
            return (
              <button
                key={section.id}
                onClick={() => {
                  setSectionFilter(section.id);
                  setSelectedId(null);
                }}
                data-testid={`nav-section-${section.id}`}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover-elevate"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{section.label}</span>
                </span>
                {section.count !== undefined && section.count > 0 && (
                  <span className="text-xs text-muted-foreground">{section.count}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Templates</p>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover-elevate text-left"
            data-testid="nav-templates"
            onClick={() =>
              toast({ title: "Templates", description: "Template management is coming in a future update." })
            }
          >
            <LayoutTemplate className="w-4 h-4 shrink-0" />
            <span>Manage Templates</span>
          </button>
        </div>
      </aside>

      {/* Center Panel */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r">
        {/* Header */}
        <div className="border-b p-4 space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-lg font-semibold" data-testid="text-page-title">
              Communication Command Center
            </h1>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled
                data-testid="button-new-message"
                onClick={() => toast({ title: "Coming Soon", description: "Message composition is coming in a future update." })}
              >
                <Mail className="w-4 h-4 mr-1" />
                New Message
              </Button>
              <Button
                variant="outline"
                disabled
                data-testid="button-templates"
                onClick={() => toast({ title: "Coming Soon", description: "Template management is coming in a future update." })}
              >
                <LayoutTemplate className="w-4 h-4 mr-1" />
                Templates
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by subject or customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="w-40" data-testid="select-customer-filter">
                <SelectValue placeholder="Customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id} data-testid={`option-customer-${c.id}`}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-32" data-testid="select-type-filter">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="note">Note</SelectItem>
                <SelectItem value="letter">Letter</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select disabled>
              <SelectTrigger className="w-36 opacity-60" data-testid="select-date-filter">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dates</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCommunications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <Inbox className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No communications found</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredCommunications.map((comm) => (
                <button
                  key={comm.id}
                  onClick={() => setSelectedId(comm.id === selectedId ? null : comm.id)}
                  data-testid={`row-communication-${comm.id}`}
                  className={`w-full text-left px-4 py-3 transition-colors hover-elevate ${
                    selectedId === comm.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" data-testid={`text-subject-${comm.id}`}>
                        {comm.subject}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {comm.customerName ?? "—"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {formatDate(comm.sentAt ?? comm.scheduledAt ?? comm.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <TypeBadge type={comm.type} />
                    <StatusBadge status={comm.status} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-96 shrink-0 flex flex-col overflow-hidden">
        {selectedComm ? (
          <div className="flex flex-col h-full overflow-y-auto">
            <div className="p-4 border-b shrink-0">
              <div className="flex items-start gap-2 mb-2">
                <TypeBadge type={selectedComm.type} />
                <StatusBadge status={selectedComm.status} />
              </div>
              <h2 className="text-base font-semibold leading-snug" data-testid="text-detail-subject">
                {selectedComm.subject}
              </h2>
            </div>

            <div className="p-4 border-b shrink-0 space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Metadata</h3>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Customer</span>
                </div>
                <span data-testid="text-detail-customer">{selectedComm.customerName ?? "—"}</span>

                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <User className="w-3.5 h-3.5" />
                  <span>Contact</span>
                </div>
                <span data-testid="text-detail-contact">{selectedComm.contactName ?? "—"}</span>

                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Tag className="w-3.5 h-3.5" />
                  <span>Type</span>
                </div>
                <span>{TYPE_LABELS[selectedComm.type] ?? selectedComm.type}</span>

                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Tag className="w-3.5 h-3.5" />
                  <span>Status</span>
                </div>
                <span>{STATUS_LABELS[selectedComm.status] ?? selectedComm.status}</span>

                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Sent by</span>
                </div>
                <span data-testid="text-detail-sent-by">{selectedComm.sentByName ?? "—"}</span>

                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>Sent at</span>
                </div>
                <span data-testid="text-detail-sent-at">{formatDate(selectedComm.sentAt)}</span>

                {selectedComm.scheduledAt && (
                  <>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Scheduled</span>
                    </div>
                    <span>{formatDate(selectedComm.scheduledAt)}</span>
                  </>
                )}
              </div>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Message Body</h3>
              <p
                className="text-sm whitespace-pre-wrap text-foreground leading-relaxed"
                data-testid="text-detail-body"
              >
                {selectedComm.body}
              </p>
            </div>

            <div className="p-4 border-t shrink-0">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                <LinkIcon className="w-3.5 h-3.5" />
                <h3 className="text-xs font-semibold uppercase tracking-wide">Linked Records</h3>
              </div>
              <p className="text-xs text-muted-foreground italic">
                No linked records. Record linking coming in a future update.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <Mail className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Select a communication</p>
            <p className="text-xs text-muted-foreground mt-1">
              Click a row to preview details
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
