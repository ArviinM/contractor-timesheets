"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createEntryAction, deleteEntryAction, updateEntryAction } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatHours } from "@/server/money";
import type { ContractorEngagement, EntryView } from "@/server/queries";
import { dayLabel } from "@/server/time";
import { sameWallDate, wallMinutes } from "./prefill";

export type EntryDialogMode =
  | { kind: "create"; engagementId?: number; start: string; end: string }
  | { kind: "edit"; entry: EntryView };

type Props = {
  mode: EntryDialogMode;
  engagements: ContractorEngagement[];
  timeZone: string;
  onClose: () => void;
};

/**
 * One form for adding and editing, opened from every view. The checks shown here are hints;
 * the server runs the real rules on save and its message is shown as-is.
 */
export function EntryDialog({ mode, engagements, timeZone, onClose }: Props) {
  const router = useRouter();
  const editing = mode.kind === "edit" ? mode.entry : null;
  const [engagementId, setEngagementId] = useState<number>(
    editing?.engagementId ?? (mode.kind === "create" ? mode.engagementId : undefined) ?? engagements[0]?.id ?? 0,
  );
  const [start, setStart] = useState(editing?.startInput ?? (mode.kind === "create" ? mode.start : ""));
  const [end, setEnd] = useState(editing?.endInput ?? (mode.kind === "create" ? mode.end : ""));
  const [note, setNote] = useState(editing?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const minutes = wallMinutes(start, end);
  const hint =
    minutes === null
      ? "Pick a start and an end."
      : minutes <= 0
        ? "End must be after start."
        : `${formatHours(minutes)} hours` +
          (sameWallDate(start, end) ? "" : `. Ends the next day, counts on ${dayLabel(start.slice(0, 10))}.`);

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = { engagementId, start, end, note };
      const result = editing ? await updateEntryAction(editing.id, input) : await createEntryAction(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Entry saved" : "Entry added", { description: describe(start, end) });
      onClose();
      router.refresh();
    });
  }

  function remove() {
    if (!editing) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteEntryAction(editing.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Entry deleted", { description: describe(editing.startInput, editing.endInput) });
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit entry" : "New entry"}</DialogTitle>
            <DialogDescription>Times are in your time zone, {timeZone}.</DialogDescription>
          </DialogHeader>

          {engagements.length > 1 && (
            <div className="grid gap-2">
              <Label id="entry-client-label">Client</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                aria-labelledby="entry-client-label"
                value={String(engagementId)}
                onValueChange={(v) => v && setEngagementId(Number(v))}
              >
                {engagements.map((g) => (
                  <ToggleGroupItem key={g.id} value={String(g.id)} className="px-3">
                    {g.clientName}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="entry-start">Start</Label>
              <Input id="entry-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="entry-end">End</Label>
              <Input id="entry-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground tabular" aria-live="polite">
            {hint}
          </p>

          <div className="grid gap-2">
            <Label htmlFor="entry-note">Note</Label>
            <Textarea
              id="entry-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you work on?"
              rows={2}
              maxLength={500}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <p className="text-xs text-muted-foreground">
            The server checks every save: end after start, no overlaps with any client, at most 12 hours a
            day, nothing in the future, and no locked weeks.
          </p>

          <DialogFooter className="sm:justify-between">
            {editing ? (
              <Button type="button" variant="destructive" onClick={remove} disabled={pending}>
                <Trash2 />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {editing ? "Save changes" : "Add entry"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function describe(start: string, end: string): string {
  return `${dayLabel(start.slice(0, 10))}, ${start.slice(11)} to ${end.slice(11)}`;
}
