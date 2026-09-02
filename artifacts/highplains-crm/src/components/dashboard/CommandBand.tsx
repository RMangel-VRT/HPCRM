import {
  CalendarClock,
  ClipboardList,
  FilePlus2,
  FileText,
  Search,
  Snowflake,
  TicketPlus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import type { PulseResponse } from "./PulseRail";

interface CommandBandProps {
  pulse?: PulseResponse;
}

type PulseSeason = NonNullable<PulseResponse["activeSeason"]>;

type CommandAction = {
  id: string;
  href: string;
  label: string;
  roles: Array<"admin" | "office">;
  icon: typeof TicketPlus;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnlyToDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

function getLocalDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatSeasonWeek(activeSeason: PulseSeason, today: string): string | null {
  if (!activeSeason.startDate || !activeSeason.endDate) return null;
  const start = dateOnlyToDate(activeSeason.startDate);
  const end = dateOnlyToDate(activeSeason.endDate);
  const current = dateOnlyToDate(today);
  if (!start || !end || !current || end < start) return null;

  const totalDays = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const elapsedDays = Math.floor((current.getTime() - start.getTime()) / DAY_MS) + 1;
  const totalWeeks = Math.max(1, Math.ceil(totalDays / 7));
  const currentWeek = Math.min(totalWeeks, Math.max(1, Math.ceil(elapsedDays / 7)));
  return `${currentWeek} / ${totalWeeks}`;
}

function formatMonthDay(value: string, locale: string): string | null {
  const date = dateOnlyToDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date);
}

function daysUntil(value: string, today: string): number | null {
  const target = dateOnlyToDate(value);
  const current = dateOnlyToDate(today);
  if (!target || !current) return null;
  return Math.max(0, Math.ceil((target.getTime() - current.getTime()) / DAY_MS));
}

function getDateWithoutYear(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

export default function CommandBand({ pulse }: CommandBandProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const locale = i18n.language === "es" ? "es-MX" : "en-US";
  const now = new Date();
  const today = getLocalDateOnly(now);
  const year = new Intl.DateTimeFormat(locale, { year: "numeric" }).format(now);

  const actions: CommandAction[] = [
    { id: "new-ticket", href: "/dashboard/tickets/new", label: t("dashboard.commandNewTicket"), roles: ["admin"], icon: TicketPlus },
    { id: "estimate-request", href: "/dashboard/tickets/new", label: t("dashboard.commandEstimateRequest"), roles: ["admin"], icon: FilePlus2 },
    { id: "build-proposal", href: "/dashboard/tools/proposals", label: t("dashboard.commandBuildProposal"), roles: ["admin", "office"], icon: FileText },
    { id: "crew-worksheet", href: "/dashboard/tools/crew-worksheets", label: t("dashboard.commandCrewWorksheet"), roles: ["admin", "office"], icon: ClipboardList },
    { id: "log-snow-event", href: "/dashboard/snow/new", label: t("dashboard.commandLogSnowEvent"), roles: ["admin", "office"], icon: Snowflake },
    { id: "open-scheduler", href: "/dashboard/scheduler", label: t("dashboard.commandOpenScheduler"), roles: ["admin", "office"], icon: CalendarClock },
  ];

  const visibleActions = actions.filter((action) =>
    action.roles.includes(user?.activeRole as "admin" | "office"),
  );
  const primaryActionId = visibleActions.some((action) => action.id === "new-ticket")
    ? "new-ticket"
    : visibleActions[0]?.id;
  const crews = pulse?.crewsToday ?? [];
  const crewCount = crews.length;
  const stopCount = crews.reduce((sum, crew) => sum + crew.stops, 0);
  const completeCount = crews.reduce((sum, crew) => sum + crew.complete, 0);
  const flaggedCount = crews.reduce((sum, crew) => sum + crew.flagged, 0);
  const snowBookAvailable = Boolean(
    pulse && (pulse.snowBook.activeSnowContracts > 0 || pulse.snowBook.expiringBeforeSeasonStart > 0),
  );
  const snowOpsDays = pulse?.nextSeason?.startDate
    ? daysUntil(pulse.nextSeason.startDate, today)
    : null;

  return (
    <section
      className="-mx-6 -mt-6 border-b border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm md:-mx-8 md:-mt-8"
      data-testid="command-band"
    >
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-6 py-7 md:px-8 md:py-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/65" data-testid="text-command-eyebrow">
              {t("dashboard.operationsEyebrow")}
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-none tracking-[-0.028em] text-sidebar-foreground md:text-4xl" data-testid="text-command-date">
              <time dateTime={now.toISOString()}>{getDateWithoutYear(now, locale)}</time>{" "}
              <span className="font-normal text-sidebar-foreground/55">{year}</span>
            </h1>
          </div>

          <Button asChild variant="outline" className="w-fit border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <Link href="/dashboard/customers" data-testid="link-command-customers">
              <Search aria-hidden="true" />
              <span>{t("dashboard.commandCustomers")}</span>
              <kbd className="ml-1 rounded border border-sidebar-border px-1.5 py-0.5 font-mono text-[0.68rem] text-sidebar-foreground/70">⌘K</kbd>
            </Link>
          </Button>
        </div>

        {pulse && (pulse.activeSeason || pulse.nextSeason || snowBookAvailable) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-sidebar-border/70 pt-4" data-testid="command-season-chips">
            {pulse.activeSeason && (
              <span className="rounded-full border border-sidebar-border bg-sidebar-accent px-3 py-1.5 text-xs text-sidebar-accent-foreground" data-testid={`chip-active-season-${pulse.activeSeason.id}`}>
                {pulse.activeSeason.name}
                {formatSeasonWeek(pulse.activeSeason, today)
                  ? ` · ${t("dashboard.commandSeasonWeek", { week: formatSeasonWeek(pulse.activeSeason, today) })}`
                  : ""}
              </span>
            )}
            {pulse.nextSeason && (
              <span className="rounded-full border border-sidebar-border bg-sidebar-accent px-3 py-1.5 text-xs text-sidebar-accent-foreground" data-testid={`chip-next-season-${pulse.nextSeason.id}`}>
                {pulse.nextSeason.name}
                {pulse.nextSeason.startDate
                  ? ` · ${t("dashboard.commandSeasonOpens", { date: formatMonthDay(pulse.nextSeason.startDate, locale) ?? pulse.nextSeason.startDate })}`
                  : ""}
              </span>
            )}
            {snowBookAvailable && (
              <span className="rounded-full border border-sidebar-border bg-sidebar-accent px-3 py-1.5 text-xs text-sidebar-accent-foreground" data-testid="chip-snow-book">
                <Snowflake className="mr-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
                {snowOpsDays !== null
                  ? t("dashboard.commandSnowOpsIn", { days: snowOpsDays })
                  : t("dashboard.commandSnowBook")}
                {" · "}
                {t("dashboard.commandSnowContracts", {
                  contracts: pulse.snowBook.activeSnowContracts,
                  expiring: pulse.snowBook.expiringBeforeSeasonStart,
                })}
              </span>
            )}
          </div>
        )}

        {crewCount > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-sidebar-border/70 pt-4 text-xs text-sidebar-foreground/75" data-testid="command-crew-ticker">
            <span className="font-semibold text-sidebar-foreground" data-testid="text-crew-count">{t("dashboard.commandCrewsOut", { count: crewCount })}</span>
            <span aria-hidden="true">·</span>
            <span data-testid="text-crew-stops">{t("dashboard.commandStopsToday", { count: stopCount })}</span>
            <span aria-hidden="true">·</span>
            <span data-testid="text-crew-complete">{t("dashboard.commandCompletedToday", { count: completeCount })}</span>
            {flaggedCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-destructive" data-testid="text-crew-flagged">{t("dashboard.commandFlaggedToday", { count: flaggedCount })}</span>
              </>
            )}
          </div>
        )}

        {visibleActions.length > 0 && (
          <nav aria-label={t("dashboard.commandActions")} className="flex flex-wrap gap-2 border-t border-sidebar-border/70 pt-4" data-testid="command-actions">
            {visibleActions.map((action) => {
              const Icon = action.icon;
              const isPrimary = action.id === primaryActionId;
              return (
                <Button
                  key={action.id}
                  asChild
                  variant={isPrimary ? "default" : "outline"}
                  className={isPrimary ? "font-semibold" : "border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}
                >
                  <Link href={action.href} data-testid={`link-command-${action.id}`}>
                    <Icon aria-hidden="true" />
                    {action.label}
                  </Link>
                </Button>
              );
            })}
          </nav>
        )}
      </div>
    </section>
  );
}