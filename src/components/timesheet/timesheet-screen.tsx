"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, GanttChart, List, Plus, Table2, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ContractorEngagement, ContractorWeek, EngagementWeek, EntryView } from "@/server/queries";
import { addDays, dayLabel } from "@/server/time";
import { DeleteEntryDialog, SubmitWeekDialog } from "./confirm-dialogs";
import { EntryDialog, type EntryDialogMode } from "./entry-dialog";
import { ListView } from "./list-view";
import { slotAfterLast, slotAt } from "./prefill";
import { TableView } from "./table-view";
import { TimelineView } from "./timeline-view";
import { DayStrip, StatCards } from "./week-summary";

export type WeekView = "list" | "table" | "timeline";

type Props = {
  week: ContractorWeek;
  engagements: ContractorEngagement[];
  view: WeekView;
  nowIso: string;
};

export function TimesheetScreen({ week, engagements, view, nowIso }: Props) {
  const router = useRouter();
  const [entryMode, setEntryMode] = useState<EntryDialogMode | null>(null);
  const [deleting, setDeleting] = useState<EntryView | null>(null);
  const [submitting, setSubmitting] = useState<EngagementWeek | null>(null);

  const weekEnd = addDays(week.weekStart, 6);
  const weekRange = `${dayLabel(week.weekStart)} to ${dayLabel(weekEnd)}`;
  const entries = week.days.flatMap((d) => d.entries);
  const openEngagements = week.engagements.filter((g) => g.status === "draft" || g.status === "rejected");
  const firstOpen = openEngagements[0]?.engagementId;
  const canAddOn = (date: string) => date <= week.today && openEngagements.length > 0;
  const defaultDay = week.today >= week.weekStart && week.today <= weekEnd ? week.today : week.weekStart;
  const canAddAny = canAddOn(defaultDay);

  const href = (w: string, v: WeekView = view) => `/timesheet?week=${w}${v === "list" ? "" : `&view=${v}`}`;
  const openCreate = (slot: { start: string; end: string }) => setEntryMode({ kind: "create", engagementId: firstOpen, ...slot });

  const viewProps = {
    week,
    multiClient: engagements.length > 1,
    canAddOn,
    onAdd: (date: string) => openCreate(slotAfterLast(date, entries)),
    onEdit: (entry: EntryView) => setEntryMode({ kind: "edit", entry }),
    onDelete: (entry: EntryView) => setDeleting(entry),
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Week of {dayLabel(week.weekStart)}</h1>
          <p className="text-sm text-muted-foreground">
            {weekRange}. Days and weeks follow your time zone, {week.timeZone}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            size="sm"
            aria-label="Week view"
            data-tour="week-views"
            value={view}
            onValueChange={(v) => v && router.replace(href(week.weekStart, v as WeekView))}
          >
            <ToggleGroupItem value="list" aria-label="List view">
              <List /> List
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="Table view">
              <Table2 /> Table
            </ToggleGroupItem>
            <ToggleGroupItem value="timeline" aria-label="Timeline view">
              <GanttChart /> Timeline
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" asChild>
              <Link href={href(week.prevWeek)} aria-label="Previous week">
                <ChevronLeft />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={href(addDays(week.today, 0))}>This week</Link>
            </Button>
            {week.inProgress || week.isFuture ? (
              <Button variant="outline" size="icon-sm" disabled aria-label="Next week">
                <ChevronRight />
              </Button>
            ) : (
              <Button variant="outline" size="icon-sm" asChild>
                <Link href={href(week.nextWeek)} aria-label="Next week">
                  <ChevronRight />
                </Link>
              </Button>
            )}
          </div>
          <Button size="sm" data-tour="new-entry" disabled={!canAddAny} onClick={() => openCreate(slotAfterLast(defaultDay, entries))}>
            <Plus /> New entry
          </Button>
        </div>
      </div>

      {week.engagements
        .filter((g) => g.status === "rejected")
        .map((g, i) => (
          <Alert key={g.engagementId} variant="destructive" data-tour={i === 0 ? "rejection" : undefined}>
            <XCircle />
            <AlertTitle>{g.clientName} rejected this week</AlertTitle>
            <AlertDescription>
              <p>&ldquo;{g.rejectComment}&rdquo;</p>
              <p>Fix the entries, then resubmit. The week is open again.</p>
            </AlertDescription>
          </Alert>
        ))}

      <StatCards week={week} onSubmit={setSubmitting} />

      {week.totalMinutes === 0 && view !== "timeline" ? (
        <Card className="items-center gap-2 p-10 text-center">
          <CalendarDays className="size-6 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-medium">No time logged this week</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {canAddAny
              ? "Add your first entry. You can also click an empty hour in the Timeline view."
              : week.isFuture
                ? "This week hasn't started yet."
                : "Nothing was logged in this week."}
          </p>
          {canAddAny && (
            <Button size="sm" className="mt-2" onClick={() => openCreate(slotAfterLast(defaultDay, entries))}>
              <Plus /> New entry
            </Button>
          )}
        </Card>
      ) : (
        <>
          <DayStrip week={week} />
          {view === "list" && <ListView {...viewProps} />}
          {view === "table" && <TableView {...viewProps} />}
          {view === "timeline" && (
            <TimelineView
              {...viewProps}
              engagements={engagements}
              nowIso={nowIso}
              onSlot={(date, hour) => openCreate(slotAt(date, hour))}
            />
          )}
        </>
      )}

      {entryMode && (
        <EntryDialog
          key={entryMode.kind === "edit" ? `edit-${entryMode.entry.id}` : `new-${entryMode.start}`}
          mode={entryMode}
          engagements={engagements.filter((g) => openEngagements.some((o) => o.engagementId === g.id))}
          timeZone={week.timeZone}
          onClose={() => setEntryMode(null)}
        />
      )}
      {deleting && <DeleteEntryDialog entry={deleting} onClose={() => setDeleting(null)} />}
      {submitting && (
        <SubmitWeekDialog
          engagement={submitting}
          weekStart={week.weekStart}
          weekRange={weekRange}
          inProgress={week.inProgress}
          onClose={() => setSubmitting(null)}
        />
      )}
    </>
  );
}
