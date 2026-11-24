"use client";

import { Lock, Send } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatHours, formatUsd } from "@/server/money";
import type { ContractorWeek, EngagementWeek } from "@/server/queries";

const CAP = 12 * 60;

export function StatCards({
  week,
  onSubmit,
}: {
  week: ContractorWeek;
  onSubmit: (engagement: EngagementWeek) => void;
}) {
  const daysWorked = week.days.filter((d) => d.minutes > 0).length;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Card className="gap-1 p-4">
        <div className="text-sm text-muted-foreground">Logged this week</div>
        <div className="font-mono text-2xl font-semibold tabular">{formatHours(week.totalMinutes)}</div>
        <div className="text-xs text-muted-foreground">
          {daysWorked} {daysWorked === 1 ? "day" : "days"} with time
          {week.engagements.length > 1 ? `, ${week.engagements.length} clients` : ""}
        </div>
      </Card>
      {week.engagements.map((g) => {
        const canSubmit = (g.status === "draft" || g.status === "rejected") && g.minutes > 0 && !week.isFuture;
        return (
          <Card key={g.engagementId} className="gap-1 p-4" data-testid={`client-card-${g.clientName}`}>
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span className="truncate">{g.clientName}</span>
              <StatusBadge status={g.status} />
            </div>
            <div className="font-mono text-2xl font-semibold tabular">{formatUsd(g.amountCents)}</div>
            <div className="text-xs text-muted-foreground tabular">
              {formatHours(g.minutes)} at {formatUsd(g.rateCents)}/h
              {g.status === "approved" ? ", rate locked" : ""}
            </div>
            <div className="mt-2 flex min-h-7 items-center gap-2 text-xs text-muted-foreground">
              {canSubmit && (
                <Button size="sm" onClick={() => onSubmit(g)}>
                  <Send />
                  {g.status === "rejected" ? "Resubmit week" : "Submit week"}
                </Button>
              )}
              {g.status === "submitted" && (
                <>
                  <Lock className="size-3.5" aria-hidden="true" /> Locked until {g.clientName} decides
                </>
              )}
              {g.status === "approved" && (
                <>
                  <Lock className="size-3.5" aria-hidden="true" /> Approved and final
                </>
              )}
              {!canSubmit && (g.status === "draft" || g.status === "rejected") && <span>Nothing to submit yet.</span>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export function DayStrip({ week }: { week: ContractorWeek }) {
  return (
    <ol className="grid grid-cols-7 gap-2" aria-label="Hours per day">
      {week.days.map((d) => {
        const frac = Math.min(d.minutes / CAP, 1);
        const left = CAP - d.minutes;
        const [weekday, ...rest] = d.label.split(" ");
        return (
          <li
            key={d.date}
            className={cn(
              "flex flex-col gap-1 rounded-lg border bg-card p-2",
              d.date === week.today && "border-primary/50 ring-1 ring-primary/20",
            )}
          >
            <div className="flex items-baseline justify-between text-xs text-muted-foreground">
              <span className={cn(d.date === week.today && "font-medium text-primary")}>{weekday}</span>
              <span className="hidden sm:inline">{rest.join(" ")}</span>
            </div>
            <div className="font-mono text-sm font-medium tabular">{formatHours(d.minutes)}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className={cn("h-full rounded-full", frac >= 1 ? "bg-amber-500" : "bg-primary")}
                style={{ width: `${frac * 100}%` }}
              />
            </div>
            <div className="hidden text-[11px] text-muted-foreground tabular md:block">
              {d.minutes === 0 ? "12:00 left" : left <= 0 ? "At the 12h limit" : `${formatHours(left)} left`}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
