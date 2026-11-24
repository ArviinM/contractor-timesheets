"use client";

import { useEffect, useRef } from "react";
import { DateTime } from "luxon";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatHours } from "@/server/money";
import type { ContractorEngagement, EntryView } from "@/server/queries";
import { addDays, dayLabel as labelOf } from "@/server/time";
import type { ViewProps } from "./list-view";

const HOUR_PX = 32;
const DAY_PX = 24 * HOUR_PX;
const BAND_TONES = ["bg-primary/[0.06]", "bg-emerald-500/[0.07]", "bg-amber-500/[0.08]"];
const SWATCH_TONES = ["bg-primary/20", "bg-emerald-500/25", "bg-amber-500/30"];

type Props = ViewProps & {
  engagements: ContractorEngagement[];
  nowIso: string;
  onSlot: (date: string, hour: number) => void;
};

type Block = { entry: EntryView; date: string; top: number; height: number; continuation: boolean };

function minuteOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
}

/** Entries as blocks per day. An overnight entry is split at midnight; the tail is drawn dashed. */
function buildBlocks(days: Props["week"]["days"]): Block[] {
  const blocks: Block[] = [];
  for (const d of days) {
    for (const e of d.entries) {
      const start = minuteOf(e.startTime);
      const crosses = e.endInput.slice(0, 10) !== e.workDate;
      const end = crosses ? 1440 : minuteOf(e.endTime);
      blocks.push({ entry: e, date: d.date, top: start, height: end - start, continuation: false });
      if (crosses && e.endTime !== "00:00") {
        blocks.push({ entry: e, date: addDays(d.date, 1), top: 0, height: minuteOf(e.endTime), continuation: true });
      }
    }
  }
  return blocks;
}

/** The client's 09:00 to 17:00 on weekdays, drawn in the contractor's day. */
function clientBands(date: string, contractorZone: string, clientZone: string): { top: number; height: number }[] {
  const dayStart = DateTime.fromISO(date, { zone: contractorZone }).startOf("day");
  const dayEnd = dayStart.plus({ days: 1 });
  const bands: { top: number; height: number }[] = [];
  for (const offset of [-1, 0, 1]) {
    const clientDay = dayStart.setZone(clientZone).startOf("day").plus({ days: offset });
    if (clientDay.weekday > 5) continue;
    const from = DateTime.max(clientDay.set({ hour: 9 }), dayStart);
    const to = DateTime.min(clientDay.set({ hour: 17 }), dayEnd);
    if (to <= from) continue;
    bands.push({ top: from.diff(dayStart, "minutes").minutes, height: to.diff(from, "minutes").minutes });
  }
  return bands;
}

export function TimelineView({ week, engagements, nowIso, canAddOn, onEdit, onSlot }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 7 * HOUR_PX });
  }, []);

  const now = DateTime.fromISO(nowIso).setZone(week.timeZone);
  const nowDate = now.toFormat("yyyy-MM-dd");
  const nowMinute = now.hour * 60 + now.minute;
  const weekDates = new Set(week.days.map((d) => d.date));
  const blocks = buildBlocks(week.days).filter((b) => weekDates.has(b.date));

  return (
    <Card className="gap-3 p-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-4 text-xs text-muted-foreground">
        <Legend swatch="bg-primary">Your entries</Legend>
        <Legend swatch="border border-dashed border-primary bg-primary/15">After midnight, counts on the day it started</Legend>
        {engagements.map((g, i) => (
          <Legend key={g.id} swatch={SWATCH_TONES[i % SWATCH_TONES.length]!}>
            {g.clientName} 9 to 5 ({g.clientTimeZone})
          </Legend>
        ))}
        <Legend swatch="h-0.5 bg-destructive">Now</Legend>
        <span className="ml-auto">Click an empty hour to add an entry there.</span>
      </div>

      <div ref={scroller} className="max-h-[560px] overflow-auto border-t">
        <div className="grid min-w-[720px] grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
          <div className="sticky top-0 z-20 border-b bg-card" />
          {week.days.map((d) => (
            <div
              key={d.date}
              className={cn(
                "sticky top-0 z-20 border-b border-l bg-card px-2 py-1.5 text-xs",
                d.date === week.today && "text-primary",
              )}
            >
              <div className="font-medium">{d.label}</div>
              <div className="font-mono text-muted-foreground tabular">{formatHours(d.minutes)}</div>
            </div>
          ))}

          <div className="relative" style={{ height: DAY_PX }}>
            {Array.from({ length: 24 }, (_, h) => (
              <span
                key={h}
                className="absolute right-1.5 -translate-y-1/2 font-mono text-[10px] text-muted-foreground tabular"
                style={{ top: h * HOUR_PX }}
              >
                {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>

          {week.days.map((d) => {
            const dayBlocks = blocks.filter((b) => b.date === d.date);
            const busy = (h: number) => dayBlocks.some((b) => b.top < (h + 1) * 60 && b.top + b.height > h * 60);
            const addable = canAddOn(d.date);
            return (
              <div
                key={d.date}
                className="relative border-l"
                style={{
                  height: DAY_PX,
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, var(--border) ${HOUR_PX - 1}px, var(--border) ${HOUR_PX}px)`,
                }}
              >
                {engagements.flatMap((g, i) =>
                  clientBands(d.date, week.timeZone, g.clientTimeZone).map((band, j) => (
                    <div
                      key={`${g.id}-${j}`}
                      aria-hidden="true"
                      className={cn("absolute inset-x-0", BAND_TONES[i % BAND_TONES.length])}
                      style={{ top: (band.top / 60) * HOUR_PX, height: (band.height / 60) * HOUR_PX }}
                    />
                  )),
                )}

                {addable &&
                  Array.from({ length: 24 }, (_, h) => h)
                    .filter((h) => !busy(h) && (d.date < nowDate || h * 60 < nowMinute))
                    .map((h) => (
                      <button
                        key={h}
                        type="button"
                        className="group absolute inset-x-0.5 flex items-center justify-center rounded text-[11px] text-primary opacity-0 hover:bg-primary/10 hover:opacity-100 focus-visible:bg-primary/10 focus-visible:opacity-100 focus-visible:outline-none"
                        style={{ top: h * HOUR_PX + 1, height: HOUR_PX - 2 }}
                        aria-label={`Add entry on ${d.label} at ${String(h).padStart(2, "0")}:00`}
                        onClick={() => onSlot(d.date, h)}
                      >
                        + {String(h).padStart(2, "0")}:00
                      </button>
                    ))}

                {dayBlocks.map((b) => (
                  <TimelineBlock key={`${b.entry.id}-${b.continuation}`} block={b} columnLabel={d.label} onEdit={onEdit} />
                ))}

                {d.date === nowDate && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-destructive"
                    style={{ top: (nowMinute / 60) * HOUR_PX }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function TimelineBlock({
  block,
  columnLabel,
  onEdit,
}: {
  block: Block;
  columnLabel: string;
  onEdit: (entry: EntryView) => void;
}) {
  const { entry, continuation } = block;
  const startDay = labelOf(entry.workDate).split(" ")[0];
  const style = {
    top: (block.top / 60) * HOUR_PX + 1,
    height: Math.max((block.height / 60) * HOUR_PX - 2, 16),
  };
  const className = cn(
    "absolute inset-x-1 z-[5] flex flex-col overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-tight",
    continuation
      ? "border border-dashed border-primary bg-primary/10 text-primary"
      : entry.locked
        ? "bg-muted-foreground/70 text-background"
        : "bg-primary text-primary-foreground hover:bg-primary/90",
  );
  const body = (
    <>
      <span className="font-mono font-medium tabular">
        {entry.startTime} to {entry.endTime}
        {entry.locked && !continuation && <Lock className="ml-1 inline size-3" aria-label="Locked" />}
      </span>
      <span className="truncate">{continuation ? `Counts on ${startDay}` : entry.note}</span>
    </>
  );
  if (continuation) {
    return (
      <div className={className} style={style} title={`Started on ${labelOf(entry.workDate)}, so it counts on that day.`}>
        {body}
      </div>
    );
  }
  if (entry.locked) {
    return (
      <div className={className} style={style} title="Locked while the week is submitted or approved">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={`Edit entry ${columnLabel}, ${entry.startTime} to ${entry.endTime}`}
      onClick={() => onEdit(entry)}
    >
      {body}
    </button>
  );
}

function Legend({ swatch, children }: { swatch: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i aria-hidden="true" className={cn("inline-block h-2.5 w-3.5 rounded-sm", swatch)} />
      {children}
    </span>
  );
}
