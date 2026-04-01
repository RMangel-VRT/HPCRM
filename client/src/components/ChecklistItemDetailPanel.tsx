import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  X,
  ExternalLink,
  ClipboardCheck,
  Building2,
  Wrench,
  MessageSquare,
  Map,
  ChevronRight,
  Calendar,
  Tag,
} from "lucide-react";
import type { CampaignItem } from "@shared/schema";
import { format } from "date-fns";

export interface ChecklistItemWithCampaign extends CampaignItem {
  campaignTitle: string;
  campaignWindowStart: string;
  campaignWindowEnd: string;
  campaignCategory: string;
  propertyId?: string | null;
}

interface ChecklistItemDetailPanelProps {
  item: ChecklistItemWithCampaign | null;
  onClose: () => void;
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "completed") return "default";
  if (status === "skipped") return "outline";
  return "secondary";
}

function stepLabel(step: string | null | undefined): string {
  if (!step) return "";
  const map: Record<string, string> = {
    pre_communication: "Pre-Communication",
    work_in_progress: "Work In Progress",
    work_completed: "Work Completed",
    post_communication: "Post-Communication",
  };
  return map[step] ?? step;
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    chemical: "Chemical",
    irrigation: "Irrigation",
    general: "General",
  };
  return map[cat] ?? (cat.charAt(0).toUpperCase() + cat.slice(1));
}

export default function ChecklistItemDetailPanel({ item, onClose }: ChecklistItemDetailPanelProps) {
  const { user } = useAuth();
  if (!item) return null;

  const canViewCustomer = ["admin", "office", "field_manager", "chemical_manager"].includes(user?.activeRole ?? "");
  const canViewCommunications = ["admin", "office"].includes(user?.activeRole ?? "");

  const executionUrl = `/dashboard/campaigns/${item.campaignId}/items/${item.id}`;
  const campaignUrl = `/dashboard/campaigns/${item.campaignId}`;
  const customerUrl = (item.customerId && canViewCustomer) ? `/dashboard/customers/${item.customerId}` : null;
  const propertyUrl = item.propertyId
    ? `/dashboard/properties/${item.propertyId}`
    : (item.customerId && canViewCustomer)
      ? `/dashboard/customers/${item.customerId}?tab=maps`
      : null;
  const commsUrl = (item.customerId && canViewCommunications)
    ? `/dashboard/customers/${item.customerId}?tab=communications`
    : null;

  return (
    <div
      className="flex flex-col h-full border-l bg-background"
      data-testid="checklist-item-detail-panel"
    >
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-sm truncate pr-2" data-testid="panel-customer-name">
          {item.customerName}
        </h3>
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          data-testid="button-close-panel"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusVariant(item.status)} data-testid="panel-status-badge">
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Badge>
            {item.workflowStep && (
              <Badge variant="outline" data-testid="panel-workflow-badge">
                {stepLabel(item.workflowStep)}
              </Badge>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Campaign</p>
          <div className="space-y-1">
            <p className="text-sm font-medium" data-testid="panel-campaign-title">{item.campaignTitle}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Tag className="w-3 h-3" />
              <span data-testid="panel-campaign-category">{categoryLabel(item.campaignCategory)}</span>
            </div>
            {item.campaignWindowStart && item.campaignWindowEnd && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                <span data-testid="panel-campaign-window">
                  {format(new Date(item.campaignWindowStart), "MMM d")} – {format(new Date(item.campaignWindowEnd), "MMM d, yyyy")}
                </span>
              </div>
            )}
          </div>
        </div>

        {item.customerCity && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Location</p>
            <p className="text-sm text-muted-foreground" data-testid="panel-customer-city">{item.customerCity}</p>
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Navigate To</p>
          <div className="space-y-1">
            <Link href={executionUrl}>
              <Button
                variant="default"
                className="w-full justify-between"
                data-testid="link-open-execution"
              >
                <span className="flex items-center gap-2">
                  <Wrench className="w-4 h-4" />
                  Open Execution Screen
                </span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>

            <Link href={campaignUrl}>
              <Button
                variant="outline"
                className="w-full justify-between"
                data-testid="link-open-campaign"
              >
                <span className="flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4" />
                  View Campaign
                </span>
                <ExternalLink className="w-3 h-3" />
              </Button>
            </Link>

            {customerUrl && (
              <Link href={customerUrl}>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  data-testid="link-open-customer"
                >
                  <span className="flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    View Customer
                  </span>
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </Link>
            )}

            {propertyUrl && (
              <Link href={propertyUrl}>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  data-testid="link-open-property"
                >
                  <span className="flex items-center gap-2">
                    <Map className="w-4 h-4" />
                    View Property
                  </span>
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </Link>
            )}

            {commsUrl && (
              <Link href={commsUrl}>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  data-testid="link-open-communications"
                >
                  <span className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    View Notes / Communications
                  </span>
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </Link>
            )}
          </div>
        </div>

        {item.notes && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="panel-notes">{item.notes}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
