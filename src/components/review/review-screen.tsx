import Link from "next/link";
import { Inbox } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatHours, formatUsd } from "@/server/money";
import type { ReviewWeek, ReviewWeekDetail } from "@/server/queries";
import { dayLabel, fromUtcText } from "@/server/time";
import { DecisionButtons } from "./decision-buttons";

type Props = {
  clientTimeZone: string;
  waiting: ReviewWeek[];
  decided: ReviewWeek[];
  approvedThisMonthCents: number;
  monthName: string;
  detail: ReviewWeekDetail | null;
};

export function ReviewScreen({ clientTimeZone, waiting, decided, approvedThisMonthCents, monthName, detail }: Props) {
  const contractors = [...new Set([...waiting, ...decided].map((w) => w.contractorName))];
  const waitingMinutes = waiting.reduce((s, w) => s + w.minutes, 0);
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
        <p className="text-sm text-muted-foreground">
          Weeks your contractors submitted. Times are shown in your time zone, {clientTimeZone}.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Waiting for you" value={String(waiting.length)} note={`${formatHours(waitingMinutes)} hours to review`} />
        <Stat label={`Approved in ${monthName}`} value={formatUsd(approvedThisMonthCents)} note="Ready to invoice" />
        <Stat label="Contractors" value={String(contractors.length)} note={contractors.join(", ") || "None yet"} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[18rem_1fr]">
        <Card className="gap-0 p-2">
          <QueueSection title="Waiting for you" weeks={waiting} selectedId={detail?.week.weekId} empty="All caught up. Weeks show here when your contractors submit them." />
          {decided.length > 0 && <QueueSection title="Recently decided" weeks={decided} selectedId={detail?.week.weekId} />}
        </Card>
        {detail ? (
          <WeekDetail detail={detail} />
        ) : (
          <Card className="items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <Inbox className="size-6" aria-hidden="true" />
            Nothing is waiting for review.
          </Card>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card className="gap-1 p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="font-mono text-2xl font-semibold tabular">{value}</div>
      <div className="truncate text-xs text-muted-foreground">{note}</div>
    </Card>
  );
}

function QueueSection({ title, weeks, selectedId, empty }: { title: string; weeks: ReviewWeek[]; selectedId?: number; empty?: string }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1 p-1">
      <h2 className="px-2 pt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      {weeks.length === 0 && empty && <p className="px-2 py-2 text-xs text-muted-foreground">{empty}</p>}
      {weeks.map((w) => (
        <Link
          key={w.weekId}
          href={`/review/${w.weekId}`}
          aria-current={w.weekId === selectedId ? "page" : undefined}
          className={cn(
            "grid grid-cols-[1fr_auto] gap-x-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
            w.weekId === selectedId && "bg-muted",
          )}
        >
          <span className="truncate font-medium">{w.contractorName}</span>
          {w.status === "submitted" ? (
            <span className="font-mono tabular">{formatHours(w.minutes)}</span>
          ) : (
            <StatusBadge status={w.status} />
          )}
          <span className="text-xs text-muted-foreground">Week of {dayLabel(w.weekStart)}</span>
          <span className="text-right font-mono text-xs text-muted-foreground tabular">
            {w.status === "submitted" ? formatUsd(w.amountCents) : formatHours(w.minutes)}
          </span>
        </Link>
      ))}
    </section>
  );
}

function city(zone: string): string {
  return (zone.split("/").pop() ?? zone).replace(/_/g, " ");
}

function stamp(utc: string | null, zone: string): string {
  return utc ? fromUtcText(utc).setZone(zone).toFormat("ccc d LLL, HH:mm") : "";
}

function WeekDetail({ detail }: { detail: ReviewWeekDetail }) {
  const { week, days, clientTimeZone } = detail;
  const weekText = `Week of ${dayLabel(week.weekStart)} (the contractor's week, ${week.contractorTimeZone})`;
  return (
    <Card className="gap-4 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{week.contractorName}</h2>
            <StatusBadge status={week.status} />
          </div>
          <p className="text-sm text-muted-foreground">{weekText}</p>
          <p className="text-xs text-muted-foreground">Submitted {stamp(week.submittedAt, clientTimeZone)}</p>
        </div>
      </div>

      {week.status === "submitted" && week.rejectComment && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          <span className="font-medium">Resubmitted.</span> Your earlier comment: &ldquo;{week.rejectComment}&rdquo;
        </p>
      )}

      <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        Grouped by your days in {clientTimeZone}. Grey text shows the same time in {week.contractorTimeZone}, and the
        day the entry counts on.
      </p>

      <div className="flex flex-col divide-y">
        {days.map((d) => (
          <section key={d.date} aria-label={d.label} className="py-2">
            <div className="flex items-center justify-between text-sm">
              <h3 className="font-medium">{d.label}</h3>
              <span className="font-mono text-muted-foreground tabular">{formatHours(d.minutes)}</span>
            </div>
            <ul className="mt-1 flex flex-col gap-1">
              {d.entries.map((e) => (
                <li key={e.id} className="grid grid-cols-[7.5rem_1fr_auto] items-baseline gap-3 text-sm">
                  <span className="font-mono tabular">
                    {e.clientStart} to {e.clientEnd}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{e.note || "No note"}</span>
                    <span className="block text-xs text-muted-foreground tabular">
                      {e.contractorStart} to {e.contractorEnd} in {city(week.contractorTimeZone)}, counts on {dayLabel(e.workDate)}
                    </span>
                  </span>
                  <span className="font-mono text-muted-foreground tabular">{formatHours(e.minutes)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <dl className="grid grid-cols-3 gap-3 rounded-lg bg-muted/50 p-3">
        <Fact label="Hours" value={formatHours(week.minutes)} note="Whole minutes" />
        <Fact
          label="Rate"
          value={`${formatUsd(week.rateCents)}/h`}
          note={week.status === "approved" ? "Locked at approval" : "Locks when you approve"}
        />
        <Fact label="Amount" value={formatUsd(week.amountCents)} note="Rounded once, to the cent" />
      </dl>

      {week.status === "submitted" && (
        <DecisionButtons
          weekId={week.weekId}
          submittedAt={week.submittedAt}
          contractorName={week.contractorName}
          weekLabel={weekText}
          hours={formatHours(week.minutes)}
          rate={`${formatUsd(week.rateCents)}/h`}
          amount={formatUsd(week.amountCents)}
          nextWaitingWeekId={detail.nextWaitingWeekId}
        />
      )}
      {week.status === "approved" && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Approved {stamp(week.decidedAt, clientTimeZone)}. It&apos;s on the invoice at {formatUsd(week.rateCents)}/h.
        </p>
      )}
      {week.status === "rejected" && (
        <p className="text-sm text-destructive">
          Rejected {stamp(week.decidedAt, clientTimeZone)}: &ldquo;{week.rejectComment}&rdquo;. Waiting for{" "}
          {week.contractorName} to fix and resubmit.
        </p>
      )}
    </Card>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-base font-medium tabular">{value}</dd>
      <dd className="text-[11px] text-muted-foreground">{note}</dd>
    </div>
  );
}
