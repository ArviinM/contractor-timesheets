"use client";

import { Fragment } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatHours } from "@/server/money";
import { EntryActions, entryLabel, type ViewProps } from "./list-view";

const CAP = 12 * 60;

export function TableView({ week, multiClient, canAddOn, onAdd, onEdit, onDelete }: ViewProps) {
  const cols = multiClient ? 6 : 5;
  return (
    <Card className="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">Day</TableHead>
            <TableHead className="w-36">Start to end</TableHead>
            <TableHead className="w-20 text-right">Hours</TableHead>
            {multiClient && <TableHead>Client</TableHead>}
            <TableHead>Note</TableHead>
            <TableHead className="w-24">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {week.days.map((d) => (
            <Fragment key={d.date}>
              {d.entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono tabular">{d.label}</TableCell>
                  <TableCell className="font-mono tabular">
                    {e.startTime} to {e.endTime}
                    {e.endsNextDay && <span className="ml-1 text-xs text-muted-foreground">(+1 day)</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular">{formatHours(e.minutes)}</TableCell>
                  {multiClient && <TableCell>{e.clientName}</TableCell>}
                  <TableCell className="max-w-64 truncate">{e.note}</TableCell>
                  <TableCell className="text-right">
                    <EntryActions entry={e} label={entryLabel(d.label, e)} onEdit={onEdit} onDelete={onDelete} />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell className="font-mono text-muted-foreground tabular">
                  {d.entries.length === 0 ? d.label : ""}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {d.entries.length === 0 ? "Nothing logged" : `${d.label} total`}
                </TableCell>
                <TableCell className="text-right font-mono font-medium tabular">{formatHours(d.minutes)}</TableCell>
                <TableCell colSpan={cols - 4} className="text-xs text-muted-foreground tabular">
                  {d.minutes >= CAP ? "At the 12h limit" : `${formatHours(CAP - d.minutes)} left today`}
                </TableCell>
                <TableCell className="text-right">
                  {canAddOn(d.date) && (
                    <Button variant="ghost" size="sm" aria-label={`Add entry on ${d.label}`} onClick={() => onAdd(d.date)}>
                      <Plus />
                      Add
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            </Fragment>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>Week total</TableCell>
            <TableCell className="text-right font-mono tabular">{formatHours(week.totalMinutes)}</TableCell>
            <TableCell colSpan={cols - 3} />
          </TableRow>
        </TableFooter>
      </Table>
    </Card>
  );
}
