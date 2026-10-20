import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { guardLinkClick } from "@/lib/unsavedGuard";

function Row({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-sm">{label}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export default function TopbarMenus() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [taskOpen, setTaskOpen] = useState(false);

  if (!user || user.isSuperAdminBool) return null;
  if (user.activeRole !== "admin" && user.activeRole !== "office") return null;

  const tools = [
    { id: "proposals", href: "/dashboard/tools/proposals", label: t("topbar.proposalMaker"), hint: t("topbar.proposalMakerHint") },
    { id: "visual-scope", href: "/dashboard/tools/visual-scope", label: t("topbar.visualScope") },
    { id: "crew-worksheets", href: "/dashboard/tools/crew-worksheets", label: t("topbar.crewWorksheets"), hint: t("topbar.crewWorksheetsHint") },
    { id: "plant-library", href: "/dashboard/tools/plant-library", label: t("topbar.plantLibrary") },
  ];
  const tasks = [
    { id: "contract", href: "/dashboard/tickets/new?workType=contract", label: t("topbar.contractWork"), hint: t("topbar.contractWorkHint") },
    { id: "extra-work", href: "/dashboard/tickets/new?workType=extra_work", label: t("topbar.billableWork"), hint: t("topbar.billableWorkHint") },
    { id: "todo", href: "/dashboard/tickets/new?workType=admin", label: t("topbar.todo"), hint: t("topbar.todoHint") },
  ];

  return (
    <div className="flex items-center gap-2 ml-2" onClickCapture={guardLinkClick as never}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5" data-testid="button-topbar-tools" aria-label={t("topbar.tools")}>
            <Wrench className="w-4 h-4" />
            <span className="hidden sm:inline">{t("topbar.tools")}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {tools.map((tool) => (
            <DropdownMenuItem key={tool.id} asChild data-testid={`menu-tools-${tool.id}`}>
              <Link href={tool.href} className="cursor-pointer">
                <Row label={tool.label} hint={tool.hint} />
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu onOpenChange={(o) => { if (!o) setTaskOpen(false); }}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-1.5" data-testid="button-topbar-new">
            <Plus className="w-4 h-4" />
            <span>{t("topbar.new")}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); setTaskOpen((v) => !v); }}
            data-testid="menu-new-task"
            aria-expanded={taskOpen}
            className="cursor-pointer justify-between"
          >
            <span className="text-sm">{t("topbar.task")}</span>
            {taskOpen ? <ChevronDown className="w-4 h-4 opacity-60" /> : <ChevronRight className="w-4 h-4 opacity-60" />}
          </DropdownMenuItem>
          {taskOpen && tasks.map((task) => (
            <DropdownMenuItem key={task.id} asChild data-testid={`menu-new-task-${task.id}`}>
              <Link href={task.href} className="cursor-pointer pl-6">
                <Row label={task.label} hint={task.hint} />
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem asChild data-testid="menu-new-estimate-request">
            <Link href="/dashboard/tickets/new?workType=estimate_request" className="cursor-pointer">
              <Row label={t("topbar.estimateRequest")} />
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild data-testid="menu-new-contract">
            <Link href="/dashboard/contracts/new" className="cursor-pointer">
              <Row label={t("topbar.contract")} hint={t("topbar.contractHint")} />
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild data-testid="menu-new-more">
            <Link href="/dashboard/tickets/new" className="cursor-pointer">
              <Row label={t("topbar.more")} hint={t("topbar.moreHint")} />
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
