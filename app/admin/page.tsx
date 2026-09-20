import Link from "next/link";
import { connectDB } from "@/lib/mongodb";
import {
  UserModel, TeamModel, ShiftRequestModel, RosterMonthModel, AuditLogModel, RosterChangeModel,
} from "@/models";
import { requireRoles } from "@/lib/auth";
import { monthKey, monthLabel, shiftLabel, isWorkCode, dayDate } from "@/lib/shifts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  UsersRound, CalendarCheck2, Inbox, Clock, ArrowRight, CalendarRange, ClipboardCheck,
} from "lucide-react";

export default async function AdminDashboard() {
  const session = await requireRoles("ADMIN", "MANAGER", "TEAM_LEADER");
  await connectDB();
  const thisMonth = monthKey();

  const [employees, teams, pending, roster, recentAudit, pendingProposals] = await Promise.all([
    UserModel().countDocuments({ role: { $in: ["EMPLOYEE", "TEAM_LEADER"] }, active: true }),
    TeamModel().countDocuments(),
    ShiftRequestModel().countDocuments({ status: "PENDING" }),
    RosterMonthModel().findOne({ month: thisMonth }),
    session.role === "ADMIN" ? AuditLogModel().find().sort({ createdAt: -1 }).limit(6) : Promise.resolve([]),
    session.role === "ADMIN" || session.role === "MANAGER"
      ? RosterChangeModel().countDocuments({ status: "PENDING" })
      : Promise.resolve(0),
  ]);

  const today = new Date().getDate();
  const todayEntry = roster?.entries ?? [];
  let workingToday = 0;
  const coverage: Record<string, number> = {};
  for (const e of todayEntry) {
    const code = e.shifts?.[today - 1] ?? "";
    if (isWorkCode(code)) {
      workingToday++;
      coverage[code] = (coverage[code] ?? 0) + 1;
    }
  }

  const stats = [
    { label: "Active Employees", value: employees, icon: UsersRound },
    { label: "Teams", value: teams, icon: UsersRound },
    { label: "Working Today", value: workingToday, icon: CalendarCheck2 },
    { label: "Pending Requests", value: pending, icon: Inbox },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {session.fullName.split(" ")[0]}&apos;s Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          {monthLabel(thisMonth)} — overview of workforce and requests
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today&apos;s Coverage</CardTitle>
            <CardDescription>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(coverage).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No shifts scheduled for today yet — build the roster first.
              </p>
            ) : (
              Object.entries(coverage).sort().map(([code, count]) => (
                <Badge key={code} variant="secondary" className="gap-2 px-3 py-1.5">
                  <span className="font-mono font-semibold text-primary">{code}</span>
                  <span className="text-muted-foreground">{shiftLabel(code)}</span>
                  <span className="font-semibold">{count}</span>
                </Badge>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="text-base">Pending Requests</CardTitle>
              <CardDescription>Shift changes and swaps awaiting review</CardDescription>
            </div>
            {pending > 0 && (
              <Button size="sm" variant="outline" render={<Link href="/admin/requests" />}>
                  Review <ArrowRight className="h-4 w-4" />
                </Button>
            )}
          </CardHeader>
          <CardContent>
            {pending === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" /> Nothing to review — all caught up.
              </p>
            ) : (
              <p className="text-sm">
                <span className="text-2xl font-bold">{pending}</span>{" "}
                <span className="text-muted-foreground">request(s) waiting for approval</span>
              </p>
            )}
            {(session.role === "ADMIN" || session.role === "MANAGER") && pendingProposals > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full justify-start gap-2"
                render={<Link href="/admin/approvals" />}
              >
                <ClipboardCheck className="h-4 w-4 text-primary" />
                {pendingProposals} roster proposal{pendingProposals === 1 ? "" : "s"} awaiting approval
                <ArrowRight className="ml-auto h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Roster</CardTitle>
            <CardDescription>{monthLabel(thisMonth)}</CardDescription>
          </div>
          <Button size="sm" render={<Link href="/admin/roster" />}>
              <CalendarRange className="h-4 w-4" /> Open Roster
            </Button>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {roster
            ? `${roster.entries.length} employees scheduled this month.`
            : "No roster built for this month yet — open the Roster page or import a CSV."}
        </CardContent>
      </Card>

      {session.role === "ADMIN" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <CardDescription>Latest audit events</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentAudit.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
            ) : (
              (recentAudit as unknown as { _id: string; actorName: string; action: string; target: string; details: string; createdAt: Date }[]).map((log) => (
                <div key={log._id} className="flex items-start gap-3 border-b pb-3 last:border-b-0 last:pb-0">
                  <Badge variant="outline" className="mt-0.5 shrink-0 font-mono text-[10px]">
                    {log.action}
                  </Badge>
                  <div className="min-w-0 text-sm">
                    <div className="truncate">
                      <span className="font-medium">{log.actorName}</span>{" "}
                      <span className="text-muted-foreground">{log.target}</span>
                    </div>
                    {log.details && <div className="truncate text-xs text-muted-foreground">{log.details}</div>}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {roster && dayDate(thisMonth, 1) && null}
    </div>
  );
}
