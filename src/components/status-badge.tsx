import { CheckCircle2, CircleDashed, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WeekStatus } from "@/server/weeks";

const STATUS = {
  draft: { label: "Draft", Icon: CircleDashed, className: "border-border text-muted-foreground" },
  submitted: { label: "Waiting for review", Icon: Clock, className: "bg-primary/10 text-primary" },
  approved: {
    label: "Approved",
    Icon: CheckCircle2,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  rejected: { label: "Rejected", Icon: XCircle, className: "bg-destructive/10 text-destructive" },
} as const;

export function statusLabel(status: WeekStatus): string {
  return STATUS[status].label;
}

export function StatusBadge({
  status,
  short = false,
  className,
}: {
  status: WeekStatus;
  short?: boolean;
  className?: string;
}) {
  const { label, Icon, className: tone } = STATUS[status];
  return (
    <Badge variant="outline" className={cn("border-transparent", tone, status === "draft" && "border-border", className)}>
      <Icon aria-hidden="true" />
      {short && status === "submitted" ? "Waiting" : label}
    </Badge>
  );
}

/** One status for a week that may have several clients: the one that needs attention first. */
export function overallStatus(statuses: WeekStatus[]): WeekStatus {
  for (const s of ["rejected", "draft", "submitted", "approved"] as const) {
    if (statuses.includes(s)) return s;
  }
  return "draft";
}
