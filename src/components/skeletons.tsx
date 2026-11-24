import { Skeleton } from "@/components/ui/skeleton";

/** Calm placeholder shapes while request-time data streams in (no spinners). */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

export function AppShellSkeleton() {
  return (
    <div className="flex min-h-svh" aria-hidden="true">
      <div className="hidden w-64 shrink-0 flex-col gap-3 border-r bg-sidebar p-3 md:flex">
        <Skeleton className="h-10" />
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
        <div className="flex-1" />
        <Skeleton className="h-10" />
      </div>
      <div className="flex-1">
        <div className="h-12 border-b" />
        <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
          <PageSkeleton />
        </div>
      </div>
    </div>
  );
}

export function SignInListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}
