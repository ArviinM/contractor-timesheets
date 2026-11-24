"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { TourButton } from "@/components/tour/tour-button";

function crumbsFor(pathname: string, role: "contractor" | "client"): { label: string; href?: string }[] {
  if (pathname.startsWith("/timesheet")) return [{ label: "Contractor" }, { label: "Timesheet" }];
  if (pathname.startsWith("/review/")) return [{ label: "Review", href: "/review" }, { label: "Week" }];
  if (pathname.startsWith("/review")) return [{ label: "Client" }, { label: "Review" }];
  if (pathname.startsWith("/invoice")) return [{ label: "Client" }, { label: "Invoice" }];
  return [{ label: role === "contractor" ? "Contractor" : "Client" }];
}

export function TopBar({ role, userId }: { role: "contractor" | "client"; userId: number }) {
  const crumbs = crumbsFor(usePathname(), role);
  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
      <SidebarTrigger aria-label="Toggle sidebar" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList>
          {crumbs.map((c, i) => (
            <Fragment key={c.label}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {i === crumbs.length - 1 ? (
                  <BreadcrumbPage>{c.label}</BreadcrumbPage>
                ) : c.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={c.href}>{c.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <span>{c.label}</span>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-1">
        <TourButton role={role} userId={userId} />
        <ThemeToggle />
      </div>
    </header>
  );
}
