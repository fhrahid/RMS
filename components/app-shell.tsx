"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CalendarRange, Inbox, UsersRound, UserCog, ScrollText,
  FileSpreadsheet, CalendarClock, CalendarDays, ClipboardCheck, LogOut,
  ChevronsUpDown, ShieldCheck, Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { logout } from "@/app/actions/auth";
import { ROLE_LABEL, type Role } from "@/lib/shifts";

interface NavItem { href: string; label: string; icon: typeof LayoutDashboard; roles: Role[] }

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN", "MANAGER", "TEAM_LEADER"] },
  { href: "/admin/roster", label: "Roster", icon: CalendarRange, roles: ["ADMIN", "MANAGER", "TEAM_LEADER"] },
  { href: "/admin/requests", label: "Requests", icon: Inbox, roles: ["ADMIN", "MANAGER", "TEAM_LEADER"] },
  { href: "/admin/approvals", label: "Approvals", icon: ClipboardCheck, roles: ["ADMIN", "MANAGER"] },
  { href: "/my-schedule", label: "My Schedule", icon: CalendarDays, roles: ["TEAM_LEADER"] },
  { href: "/admin/teams", label: "Teams", icon: UsersRound, roles: ["ADMIN"] },
  { href: "/admin/users", label: "Users", icon: UserCog, roles: ["ADMIN"] },
  { href: "/admin/csv", label: "CSV Import/Export", icon: FileSpreadsheet, roles: ["ADMIN", "MANAGER"] },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText, roles: ["ADMIN"] },
];

export interface ShellUser {
  fullName: string;
  username: string;
  role: Role;
  employeeCode?: string | null;
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const initials = user.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const isEmployee = user.role === "EMPLOYEE";

  return (
    <div className="flex min-h-screen w-full">
      {!isEmployee && (
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
          <div className="flex items-center gap-2 px-5 py-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Roster MS</div>
              <div className="text-xs text-muted-foreground">Management Console</div>
            </div>
          </div>
          <Separator />
          <nav className="flex flex-1 flex-col gap-1 p-3">
            {NAV.filter((n) => n.roles.includes(user.role)).map((item) => {
              const active =
                item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Button
                  key={item.href}
                  variant={active ? "secondary" : "ghost"}
                  className={`w-full justify-start gap-3 ${active ? "font-medium" : "text-muted-foreground"}`}
                 render={<Link href={item.href} />}>
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
              );
            })}
          </nav>
          <div className="p-3">
            <div className="flex items-center gap-2 rounded-lg border bg-card p-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
              <span>{ROLE_LABEL[user.role]} access</span>
            </div>
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:px-6">
          <div className="flex items-center gap-3">
            {isEmployee && (
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <CalendarClock className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold">Roster MS</span>
              </div>
            )}
            {!isEmployee && (
              <div className="md:hidden">
                <Sheet>
                  <SheetTrigger
                    render={<Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open menu" />}
                  >
                    <Menu className="h-4 w-4" />
                  </SheetTrigger>
                  <SheetContent side="left" className="w-64">
                    <SheetHeader>
                      <SheetTitle>Roster MS</SheetTitle>
                      <SheetDescription>{ROLE_LABEL[user.role]} console</SheetDescription>
                    </SheetHeader>
                    <nav className="flex flex-col gap-1 px-3 pb-4">
                      {NAV.filter((n) => n.roles.includes(user.role)).map((item) => {
                        const active =
                          item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                        const Icon = item.icon;
                        return (
                          <SheetClose
                            key={item.href}
                            render={
                              <Button
                                variant={active ? "secondary" : "ghost"}
                                className={`w-full justify-start gap-3 ${active ? "font-medium" : "text-muted-foreground"}`}
                              />
                            }
                          >
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </SheetClose>
                        );
                      })}
                    </nav>
                  </SheetContent>
                </Sheet>
              </div>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" className="gap-2 px-2" />
              }
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-medium leading-tight">{user.fullName}</span>
                <span className="block text-xs text-muted-foreground leading-tight">
                  {ROLE_LABEL[user.role]}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <div>{user.fullName}</div>
                  <div className="flex items-center gap-1.5 pt-0.5 font-normal text-xs text-muted-foreground">
                    @{user.username}
                    {user.employeeCode && (
                      <Badge variant="secondary" className="h-4 px-1.5 font-mono text-[10px]">
                        {user.employeeCode}
                      </Badge>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(isEmployee || user.role === "TEAM_LEADER") && (
                  <DropdownMenuItem render={<Link href="/my-schedule" />}>My Schedule</DropdownMenuItem>
                )}
                {!isEmployee && (
                  <DropdownMenuItem render={<Link href="/admin" />}>Dashboard</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <form action={logout}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-sm text-red-600 outline-none transition-colors hover:bg-red-50 focus:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" /> Log out
                  </button>
                </form>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 bg-muted/40 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
