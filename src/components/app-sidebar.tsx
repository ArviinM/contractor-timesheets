"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, Clock3, FileText, Inbox, LogOut } from "lucide-react";
import { signOutAction } from "@/app/actions";
import { Logo } from "@/components/logo";
import { StatusBadge, overallStatus } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { RecentWeek } from "@/server/queries";

type Props = {
  user: { name: string; role: "contractor" | "client"; timeZone: string };
  currentWeek: string;
  recentWeeks: RecentWeek[];
  waiting: number;
};

function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m! - 1];
  return `${d} ${month}`;
}

export function AppSidebar({ user, currentWeek, recentWeeks, waiting }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedWeek = params.get("week") ?? currentWeek;

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-1 py-1">
          <Logo />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Timesheets</span>
            <span className="text-xs text-muted-foreground">Hours, approvals, invoices</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {user.role === "contractor" ? (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/timesheet" && selectedWeek === currentWeek}>
                    <Link href="/timesheet">
                      <Clock3 />
                      <span>Timesheet</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname.startsWith("/review")}>
                      <Link href="/review">
                        <Inbox />
                        <span>Review</span>
                      </Link>
                    </SidebarMenuButton>
                    {waiting > 0 && <SidebarMenuBadge aria-label={`${waiting} waiting`}>{waiting}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                  <SidebarMenuItem data-tour="invoice-nav">
                    <SidebarMenuButton asChild isActive={pathname.startsWith("/invoice")}>
                      <Link href="/invoice">
                        <FileText />
                        <span>Invoice</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {user.role === "contractor" && recentWeeks.length > 0 && (
          <SidebarGroup data-tour="recent-weeks">
            <SidebarGroupLabel>Recent weeks</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {recentWeeks.map((w) => (
                  <SidebarMenuItem key={w.weekStart}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === "/timesheet" && selectedWeek === w.weekStart}
                      className="h-auto py-1.5"
                    >
                      <Link href={`/timesheet?week=${w.weekStart}`}>
                        <CalendarDays />
                        <span className="flex-1">Week of {shortDate(w.weekStart)}</span>
                        <StatusBadge status={overallStatus(w.statuses.map((s) => s.status))} short />
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 rounded-lg px-1 py-1">
          <UserAvatar name={user.name} role={user.role} />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {user.role === "contractor" ? "Contractor" : "Client"} · {user.timeZone}
            </span>
          </div>
        </div>
        <form action={signOutAction} data-tour="switch-user">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton type="submit">
                <LogOut />
                <span>Switch user</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </form>
      </SidebarFooter>
    </Sidebar>
  );
}
