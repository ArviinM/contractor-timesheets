"use client";

import { Lock, Moon, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatHours } from "@/server/money";
import type { ContractorWeek, EntryView } from "@/server/queries";

export type ViewProps = {
  week: ContractorWeek;
  multiClient: boolean;
  canAddOn: (date: string) => boolean;
  onAdd: (date: string) => void;
  onEdit: (entry: EntryView) => void;
  onDelete: (entry: EntryView) => void;
};

export function EntryActions({ entry, label, onEdit, onDelete }: {
  entry: EntryView;
  label: string;
  onEdit: (entry: EntryView) => void;
  onDelete: (entry: EntryView) => void;
}) {
  if (entry.locked) {
    return (
      <span className="inline-flex size-7 items-center justify-center text-muted-foreground" title="Locked while the week is submitted or approved">
        <Lock className="size-3.5" aria-label="Locked" />
      </span>
    );
  }
  return (
    <span className="flex">
      <Button variant="ghost" size="icon-sm" aria-label={`Edit entry ${label}`} onClick={() => onEdit(entry)}>
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete entry ${label}`}
        className="text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(entry)}
      >
        <Trash2 />
      </Button>
    </span>
  );
}

export function entryLabel(day: string, e: EntryView): string {
  return `${day}, ${e.startTime} to ${e.endTime}`;
}

export function ListView({ week, multiClient, canAddOn, onAdd, onEdit, onDelete }: ViewProps) {
  return (
    <Card className="gap-0 divide-y p-0">
      {week.days.map((d) => (
        <section key={d.date} aria-label={d.label} className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{d.label}</h3>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground tabular">{formatHours(d.minutes)}</span>
              {canAddOn(d.date) && (
                <Button variant="ghost" size="sm" aria-label={`Add entry on ${d.label}`} onClick={() => onAdd(d.date)}>
                  <Plus />
                  Add
                </Button>
              )}
            </div>
          </div>
          {d.entries.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">Nothing logged</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {d.entries.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 hover:bg-muted/50 sm:flex-nowrap"
                >
                  <span className="shrink-0 font-mono text-sm whitespace-nowrap tabular sm:w-32">
                    {e.startTime} to {e.endTime}
                  </span>
                  <span className="w-12 shrink-0 font-mono text-sm text-muted-foreground tabular sm:text-right">
                    {formatHours(e.minutes)}
                  </span>
                  {/* On phones the note drops to its own line under the times. */}
                  <span className="order-last flex min-w-0 basis-full flex-wrap items-center gap-2 sm:order-none sm:flex-1 sm:basis-auto sm:flex-nowrap">
                    {multiClient && <Badge variant="outline">{e.clientName}</Badge>}
                    <span className="truncate text-sm">{e.note || <span className="text-muted-foreground">No note</span>}</span>
                    {e.endsNextDay && (
                      <Badge variant="secondary" className="shrink-0">
                        <Moon aria-hidden="true" />
                        Ends next day
                      </Badge>
                    )}
                  </span>
                  <span className="ml-auto">
                    <EntryActions entry={e} label={entryLabel(d.label, e)} onEdit={onEdit} onDelete={onDelete} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </Card>
  );
}
