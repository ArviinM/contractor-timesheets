import { cn } from "@/lib/utils";

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function UserAvatar({
  name,
  role,
  className,
}: {
  name: string;
  role: "contractor" | "client";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold",
        role === "contractor"
          ? "bg-primary/10 text-primary"
          : "bg-muted text-foreground ring-1 ring-border",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
