import { CalendarPlus, ClipboardList, FilePlus2, MapPinned, MonitorPlay, Search } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import type { PulseResponse } from "./PulseRail";
import { useAuth } from "@/hooks/use-auth";

interface CommandBandProps {
  pulse?: PulseResponse;
}

function formatSeasonDate(value: string | null, language: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString(language === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric" });
}

export default function CommandBand({ pulse }: CommandBandProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const language = i18n.language;
  const today = new Date();
  const date = today.toLocaleDateString(language === "es" ? "es-MX" : "en-US", { weekday: "long", month: "long", day: "numeric" });
  const year = today.toLocaleDateString(language === "es" ? "es-MX" : "en-US", { year: "numeric" });
  const isAdmin = user?.activeRole === "admin";
  const isOffice = isAdmin || user?.activeRole === "office";
  const crews = pulse?.crewsToday ?? [];
  const seasonChips = [
    pulse?.activeSeason?.name ? `${pulse.activeSeason.name}${pulse.activeSeason.startDate && pulse.activeSeason.endDate ? ` · ${formatSeasonDate(pulse.activeSeason.startDate, language)}–${formatSeasonDate(pulse.activeSeason.endDate, language)}` : ""}` : null,
    pulse?.nextSeason?.name && pulse.nextSeason.startDate ? `${pulse.nextSeason.name} opens ${formatSeasonDate(pulse.nextSeason.startDate, language)}` : null,
    pulse?.snowBook?.activeSnowContracts ? `Snow ops · ${pulse.snowBook.activeSnowContracts} contracts${pulse.snowBook.expiringBeforeSeasonStart ? ` · ${pulse.snowBook.expiringBeforeSeasonStart} expire first` : ""}` : null,
  ].filter(Boolean) as string[];

  return (
    <section className="relative overflow-hidden rounded-md bg-[hsl(var(--sidebar))] px-5 py-5 text-[hsl(var(--sidebar-foreground))] shadow-sm md:px-7 md:py-6" data-testid="command-band">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--sidebar-foreground)/0.65)]">High Plains · Operations</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.028em] md:text-3xl" data-testid="text-command-date">
            {date} <span className="font-normal text-[hsl(var(--sidebar-foreground)/0.6)]">{year}</span>
          </h1>
        </div>
        <Link
          href="/dashboard/customers"
          className="inline-flex items-center gap-2 rounded-md border border-[hsl(var(--sidebar-border))] px-3 py-2 text-xs font-medium text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--sidebar-ring))]"
          data-testid="button-command-jump"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          Jump to <kbd className="rounded border border-[hsl(var(--sidebar-border))] px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </Link>
      </div>

      {seasonChips.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2" data-testid="command-season-chips">
          {seasonChips.map((chip) => <span key={chip} className="rounded-full border border-[hsl(var(--sidebar-border))] px-3 py-1 text-xs text-[hsl(var(--sidebar-foreground)/0.82)]">{chip}</span>)}
        </div>
      )}

      {crews.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[hsl(var(--sidebar-foreground)/0.72)]" data-testid="command-crew-ticker">
          <span className="font-semibold text-[hsl(var(--sidebar-foreground))]">{crews.length} crews out</span>
          <span>{crews.reduce((total, crew) => total + crew.stops, 0)} stops today</span>
          <span>{crews.reduce((total, crew) => total + crew.complete, 0)} completed</span>
          <span className={crews.reduce((total, crew) => total + crew.flagged, 0) > 0 ? "font-semibold text-[hsl(var(--warning))]" : undefined}>
            {crews.reduce((total, crew) => total + crew.flagged, 0)} flagged
          </span>
        </div>
      )}

      {isOffice && (
        <div className="mt-5 flex flex-wrap gap-2" data-testid="command-actions">
          {isAdmin && <Link href="/dashboard/tickets/new" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="button-command-new-ticket"><FilePlus2 className="h-3.5 w-3.5" />New ticket</Link>}
          {isAdmin && <Link href="/dashboard/tickets/new" className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--sidebar-border))] px-3 py-2 text-xs font-medium hover:bg-[hsl(var(--sidebar-accent))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--sidebar-ring))]" data-testid="button-command-estimate"><ClipboardList className="h-3.5 w-3.5" />Estimate request</Link>}
          <Link href="/dashboard/tools/proposals" className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--sidebar-border))] px-3 py-2 text-xs font-medium hover:bg-[hsl(var(--sidebar-accent))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--sidebar-ring))]" data-testid="button-command-proposal"><FilePlus2 className="h-3.5 w-3.5" />Build proposal</Link>
          <Link href="/dashboard/tools/crew-worksheets" className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--sidebar-border))] px-3 py-2 text-xs font-medium hover:bg-[hsl(var(--sidebar-accent))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--sidebar-ring))]" data-testid="button-command-worksheet"><CalendarPlus className="h-3.5 w-3.5" />Crew worksheet</Link>
          <Link href="/dashboard/snow/new" className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--sidebar-border))] px-3 py-2 text-xs font-medium hover:bg-[hsl(var(--sidebar-accent))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--sidebar-ring))]" data-testid="button-command-snow"><MapPinned className="h-3.5 w-3.5" />Log snow event</Link>
          <Link href="/dashboard/scheduler" className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--sidebar-border))] px-3 py-2 text-xs font-medium hover:bg-[hsl(var(--sidebar-accent))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--sidebar-ring))]" data-testid="button-command-scheduler"><MonitorPlay className="h-3.5 w-3.5" />Open scheduler</Link>
        </div>
      )}
      <span className="sr-only">{t("dashboard.businessOverview")}</span>
    </section>
  );
}