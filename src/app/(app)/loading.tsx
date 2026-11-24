import { PageSkeleton } from "@/components/skeletons";

/** Each page reads request-time data (cookie, clock, database), so it streams in behind this. */
export default function Loading() {
  return <PageSkeleton />;
}
