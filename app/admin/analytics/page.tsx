import { connectDB } from "@/lib/mongodb";
import {
  AuditLogModel, UserModel, TeamModel, RosterMonthModel, ShiftRequestModel, RosterChangeModel,
} from "@/models";
import { requireRoles } from "@/lib/auth";
import { daysInMonth, monthKey, monthLabel, ROLE_LABEL, isWorkCode, type Role } from "@/lib/shifts";
import { computeTeamPerformance, computeEmployeeMetrics, WEIGHTS, type TeamInput, type EmployeeInput } from "@/lib/performance";
import { MonthSelect } from "@/components/month-select";
import { ActivityChart, type DailyPoint, type UserPoint } from "@/components/activity-chart";
import { PerformanceMathDialog } from "@/components/performance-math-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, BarChart3, CalendarClock, Download, FileText, Flame, Trophy, UsersRound, Sigma,
} from "lucide-react";

interface LogRow {
  actor: string;
  actorName: string;
  action: string;
  target: string;
  details: string;
  createdAt: Date;
}

const CATEGORIES = [
  { key: "roster", label: "Roster", chip: "bg-blue-50 text-blue-700 border-blue-200", bar: "bg-blue-500" },
  { key: "request", label: "Requests", chip: "bg-violet-50 text-violet-700 border-violet-200", bar: "bg-violet-500" },
  { key: "user", label: "Users", chip: "bg-amber-50 text-amber-700 border-amber-200", bar: "bg-amber-500" },
  { key: "team", label: "Teams", chip: "bg-cyan-50 text-cyan-700 border-cyan-200", bar: "bg-cyan-500" },
  { key: "auth", label: "Sign-ins", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500" },
  { key: "other", label: "Other", chip: "bg-muted text-muted-foreground border-border", bar: "bg-gray-400" },
] as const;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await requireRoles("ADMIN", "MANAGER");
  const { month: monthParam } = await searchParams;
  await connectDB();

  // Months that have audit activity, newest first — always include the current month.
  const dates = (await AuditLogModel().distinct("createdAt")) as unknown as (Date | null)[];
  const months = [...new Set(dates.filter(Boolean).map((d) => monthKey(new Date(d!))))].sort().reverse();
  if (!months.includes(monthKey())) months.unshift(monthKey());
  const month = monthParam && months.includes(monthParam) ? monthParam : months[0];

  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const dim = daysInMonth(month);

  const [logs, users, teams, roster, monthRequests, monthProposals] = await Promise.all([
    AuditLogModel()
      .find({ createdAt: { $gte: start, $lt: end } })
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean() as unknown as Promise<LogRow[]>,
    UserModel().find().select("fullName role team"),
    TeamModel().find().select("name"),
    RosterMonthModel().findOne({ month }),
    ShiftRequestModel().find({ month }).select("status requester"),
    RosterChangeModel().find({ month }).select("status employee"),
  ]);

  const roleOf = new Map(users.map((u) => [u.fullName, u.role as Role]));
  const teamName = new Map(teams.map((t) => [String(t._id), t.name]));
  const teamOf = new Map(
    users.map((u) => [u.fullName, u.team ? (teamName.get(String(u.team)) ?? "—") : "—"])
  );

  // Aggregate: per day, per user, per category, per action type.
  const perDay: number[] = new Array(dim).fill(0);
  const perUser = new Map<string, { total: number; byCat: Record<string, number> }>();
  const perAction = new Map<string, number>();

  for (const log of logs) {
    const when = new Date(log.createdAt);
    if (!Number.isNaN(when.getTime()) && when >= start && when < end) perDay[when.getDate() - 1]++;

    const name = log.actorName || "(unknown)";
    const entry = perUser.get(name) ?? { total: 0, byCat: {} };
    entry.total++;
    const cat = log.action.split(".")[0];
    entry.byCat[cat] = (entry.byCat[cat] ?? 0) + 1;
    perUser.set(name, entry);

    perAction.set(log.action, (perAction.get(log.action) ?? 0) + 1);
  }

  const total = logs.length;
  const activeUsers = perUser.size;
  const busiestDay = perDay.indexOf(Math.max(...perDay));
  const busiestCount = perDay[busiestDay] ?? 0;
  const topUser = [...perUser.entries()].sort((a, b) => b[1].total - a[1].total)[0];

  const daily: DailyPoint[] = perDay.map((count, i) => ({ day: i + 1, count }));
  const byUser: UserPoint[] = [...perUser.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, s]) => ({
      name,
      role: ROLE_LABEL[roleOf.get(name) ?? "EMPLOYEE"],
      count: s.total,
    }));

  const catTotals = CATEGORIES.map((c) => ({ ...c, count: 0 }));
  for (const log of logs) {
    const prefix = log.action.split(".")[0];
    const match = catTotals.find((c) => c.key === prefix) ?? catTotals.find((c) => c.key === "other");
    if (match) match.count++;
  }

  const topActions = [...perAction.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxAction = topActions[0]?.[1] ?? 1;

  // ---- Team performance inputs -------------------------------------------
  // "Changes" = any action except sign-ins — every edit/request/proposal is a
  // symptom of roster instability, so fewer means better.
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const teamOfUser = (u: { team?: unknown } | undefined) =>
    u?.team ? (teamName.get(String(u.team)) ?? null) : null;

  const teamAgg = new Map<string, TeamInput>();
  for (const t of teams) {
    teamAgg.set(t.name, {
      teamName: t.name, members: 0, actions: 0, requestsSubmitted: 0,
      approved: 0, rejected: 0, pending: 0,
      workedShifts: 0, sickShifts: 0, otherLeaveShifts: 0,
    });
  }
  for (const u of users) {
    const tn = teamOfUser(u);
    if (tn && teamAgg.has(tn)) teamAgg.get(tn)!.members++;
  }
  for (const log of logs) {
    if (log.action.startsWith("auth.")) continue;
    const tn = teamOf.get(log.actorName);
    if (tn && teamAgg.has(tn)) teamAgg.get(tn)!.actions++;
  }
  for (const r of monthRequests) {
    const tn = teamOfUser(userById.get(String(r.requester)));
    if (!tn || !teamAgg.has(tn)) continue;
    const t = teamAgg.get(tn)!;
    t.requestsSubmitted++;
    if (r.status === "APPROVED") t.approved++;
    else if (r.status === "REJECTED") t.rejected++;
    else t.pending++;
  }
  for (const p of monthProposals) {
    const tn = teamOfUser(userById.get(String(p.employee)));
    if (!tn || !teamAgg.has(tn)) continue;
    const t = teamAgg.get(tn)!;
    if (p.status === "APPROVED") t.approved++;
    else if (p.status === "REJECTED") t.rejected++;
    else t.pending++;
  }
  if (roster) {
    for (const entry of roster.entries) {
      const tn = teamOfUser(userById.get(String(entry.employee)));
      if (!tn || !teamAgg.has(tn)) continue;
      const t = teamAgg.get(tn)!;
      for (const code of entry.shifts ?? []) {
        if (isWorkCode(code)) t.workedShifts++;
        else if (code === "SL") t.sickShifts++;
        else if (code && code !== "DO") t.otherLeaveShifts++;
      }
    }
  }
  const teamScores = computeTeamPerformance([...teamAgg.values()].filter((t) => t.members > 0));

  // ---- Per-employee metrics ----------------------------------------------
  const empAgg = new Map<string, EmployeeInput>();
  for (const u of users) {
    const tn = teamOfUser(u);
    if (!tn) continue;
    empAgg.set(u.fullName, {
      name: u.fullName, teamName: tn,
      role: ROLE_LABEL[u.role as Role] ?? u.role,
      actions: 0, requestsSubmitted: 0, approved: 0, rejected: 0, pending: 0,
      workedDays: 0, sickDays: 0, otherLeaveDays: 0, daysOff: 0,
    });
  }
  for (const log of logs) {
    if (log.action.startsWith("auth.")) continue;
    const actor = empAgg.get(log.actorName);
    if (actor) actor.actions++;
  }
  for (const r of monthRequests) {
    const u = userById.get(String(r.requester));
    const e = u ? empAgg.get(u.fullName) : undefined;
    if (!e) continue;
    e.requestsSubmitted++;
    if (r.status === "APPROVED") e.approved++;
    else if (r.status === "REJECTED") e.rejected++;
    else e.pending++;
  }
  if (roster) {
    for (const entry of roster.entries) {
      const u = userById.get(String(entry.employee));
      const e = u ? empAgg.get(u.fullName) : undefined;
      if (!e) continue;
      for (const code of entry.shifts ?? []) {
        if (isWorkCode(code)) e.workedDays++;
        else if (code === "SL") e.sickDays++;
        else if (code === "DO") e.daysOff++;
        else if (code) e.otherLeaveDays++;
      }
    }
  }
  const employeeScores = computeEmployeeMetrics([...empAgg.values()]);

  const scoreColor = (score: number) => (score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444");
  const attendanceColor = (a: number) => (a >= 0.95 ? "#10b981" : a >= 0.85 ? "#f59e0b" : "#ef4444");

  const stats: { label: string; value: number; sub?: string; icon: typeof Activity }[] = [
    { label: "Total Actions", value: total, icon: Activity },
    { label: "Users With Activity", value: activeUsers, icon: UsersRound },
    {
      label: "Busiest Day",
      value: total ? busiestCount : 0,
      sub: total
        ? new Date(y, m - 1, busiestDay + 1).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "—",
      icon: Flame,
    },
    {
      label: "Most Active",
      value: topUser ? topUser[1].total : 0,
      sub: topUser ? topUser[0] : "—",
      icon: Trophy,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            Reports &amp; Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Who did what, when, and how often — {monthLabel(month)}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthSelect months={months} selected={month} basePath="/admin/analytics" />
          <Button render={<a href={`/api/reports/activity?month=${month}`} />}>
            <Download className="h-4 w-4" /> Download Report
          </Button>
        </div>
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
              {s.sub && <p className="truncate text-xs text-muted-foreground">{s.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <ActivityChart
        month={month}
        daily={daily}
        byUser={byUser}
        totalActions={total}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="text-base">Team Performance</CardTitle>
              <CardDescription>
                Fewer changes = higher score — calm, present teams rank best ·{" "}
                {monthLabel(month)}
              </CardDescription>
            </div>
            {session.role === "ADMIN" && (
              <PerformanceMathDialog monthLabelStr={monthLabel(month)} teams={teamScores} />
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            {teamScores.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No teams with members found.
              </p>
            ) : (
              teamScores.map((t) => (
                <div key={t.teamName} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="h-6 w-6 justify-center p-0 font-mono text-[11px]"
                      >
                        {t.rank}
                      </Badge>
                      <span className="font-medium">{t.teamName}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.members} member{t.members === 1 ? "" : "s"} · {t.actions} change
                        {t.actions === 1 ? "" : "s"} · {t.requestsSubmitted} request
                        {t.requestsSubmitted === 1 ? "" : "s"}
                      </span>
                    </div>
                    <span className="text-lg font-bold" style={{ color: scoreColor(t.score) }}>
                      {t.score.toFixed(1)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${t.score}%`, backgroundColor: scoreColor(t.score) }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Stability {Math.round(t.stability * 100)}%</span>
                    <span>Quality {Math.round(t.quality * 100)}%</span>
                    <span>Attendance {Math.round(t.attendance * 100)}%</span>
                    <span>
                      Sick {t.sickShifts}d · Missed {t.sickShifts + t.otherLeaveShifts}d
                    </span>
                    <span>
                      ({t.approved}✓ / {t.rejected}✗ / {t.pending} pending)
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sigma className="h-4 w-4 text-primary" /> Scoring Model
            </CardTitle>
            <CardDescription>How each team score is calculated</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/50 p-3 text-center font-mono text-[13px] leading-relaxed">
              Score = 100 × ( {WEIGHTS.stability}·S + {WEIGHTS.quality}·Q +{" "}
              {WEIGHTS.attendance}·T − {WEIGHTS.sickness}·H − {WEIGHTS.backlog}·B )
            </div>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <span className="font-semibold text-foreground">S — Stability:</span> 1 −
                (team changes per member ÷ most-changed team&apos;s). Fewer edits, requests and
                proposals = a calm, well-planned roster = better.
              </li>
              <li>
                <span className="font-semibold text-foreground">Q — Quality:</span> approved ÷
                (approved + rejected) of the team&apos;s requests; a perfect 1 when nothing
                needed reviewing.
              </li>
              <li>
                <span className="font-semibold text-foreground">T — Attendance:</span> worked ÷
                scheduled (worked + sick + other leave); 0.5 if no roster exists.
              </li>
              <li>
                <span className="font-semibold text-foreground">H — Sickness:</span> sick days
                (SL) ÷ scheduled — an extra penalty for chronic sick leave on top of attendance.
              </li>
              <li>
                <span className="font-semibold text-foreground">B — Backlog:</span> pending
                items ÷ worst team&apos;s pending (penalty).
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Positive weights sum to 1.00, so a perfect team scores 100; the score is clamped
              at 0. Sign-ins are not counted as changes.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Employee Metrics</CardTitle>
          <CardDescription>
            Who requests the most, who is sickest, who misses the most workdays —{" "}
            {monthLabel(month)} (best attendance first)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {employeeScores.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No employee data for {monthLabel(month)}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3 text-right">Changes</th>
                    <th className="px-4 py-3 text-right">Requests</th>
                    <th className="px-4 py-3 text-right">✓ / ✗</th>
                    <th className="px-4 py-3 text-right">Worked</th>
                    <th className="px-4 py-3 text-right">Sick</th>
                    <th className="px-4 py-3 text-right">Other leave</th>
                    <th className="px-4 py-3 text-right">Missed</th>
                    <th className="px-4 py-3">Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeScores.map((e) => {
                    const a = e.attendance;
                    return (
                      <tr key={e.name} className="border-b last:border-b-0 hover:bg-muted/40">
                        <td className="px-4 py-2.5 text-muted-foreground">{e.rank}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{e.name}</div>
                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            <span className="text-xs text-muted-foreground">{e.role}</span>
                            {e.flags.map((flag) => (
                              <Badge
                                key={flag}
                                variant="outline"
                                className={`h-4 px-1 text-[9px] ${
                                  flag === "Best attendance"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-red-200 bg-red-50 text-red-700"
                                }`}
                              >
                                {flag}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{e.teamName}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{e.actions}</td>
                        <td className="px-4 py-2.5 text-right">
                          {e.requestsSubmitted}
                          {e.pending > 0 && (
                            <span className="text-xs text-muted-foreground"> (+{e.pending})</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                          {e.approved} / {e.rejected}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{e.workedDays}</td>
                        <td className={`px-4 py-2.5 text-right ${e.sickDays > 0 ? "font-semibold text-red-600" : "text-muted-foreground"}`}>
                          {e.sickDays}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{e.otherLeaveDays}</td>
                        <td className={`px-4 py-2.5 text-right ${e.missedDays > 2 ? "font-semibold text-amber-600" : "text-muted-foreground"}`}>
                          {e.missedDays}
                        </td>
                        <td className="px-4 py-2.5">
                          {a === null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.round(a * 100)}%`,
                                    backgroundColor: attendanceColor(a),
                                  }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {Math.round(a * 100)}%
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Action Categories</CardTitle>
            <CardDescription>Share of {total} recorded action(s) by category</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {catTotals.map((c) => {
              const pct = total ? Math.round((c.count / total) * 100) : 0;
              return (
                <div key={c.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <Badge variant="outline" className={`font-mono text-[10px] ${c.chip}`}>
                      {c.label}
                    </Badge>
                    <span className="text-muted-foreground">
                      {c.count} · {pct}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Action Types</CardTitle>
            <CardDescription>Most frequent actions this month</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {topActions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No actions recorded for this month.</p>
            ) : (
              topActions.map(([action, n]) => (
                <div key={action} className="flex items-center gap-3">
                  <Badge variant="outline" className="w-44 shrink-0 justify-center font-mono text-[10px]">
                    {action}
                  </Badge>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round((n / maxAction) * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-sm font-semibold">{n}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actions per User</CardTitle>
          <CardDescription>
            Monthly breakdown of every recorded action, grouped by the person who performed it
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {byUser.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <CalendarClock className="h-8 w-8" />
              <p className="text-sm">No user activity recorded for {monthLabel(month)}.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    {CATEGORIES.slice(0, 5).map((c) => (
                      <th key={c.key} className="px-3 py-3 text-right">{c.label}</th>
                    ))}
                    <th className="px-4 py-3">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {byUser.map((u, i) => {
                    const entry = perUser.get(u.name)!;
                    const pct = total ? Math.round((u.count / total) * 100) : 0;
                    return (
                      <tr key={u.name} className="border-b last:border-b-0 hover:bg-muted/40">
                        <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-2.5 font-medium">{u.name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{u.role}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{teamOf.get(u.name) ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{u.count}</td>
                        {CATEGORIES.slice(0, 5).map((c) => (
                          <td key={c.key} className="px-3 py-2.5 text-right text-muted-foreground">
                            {entry.byCat[c.key] || "—"}
                          </td>
                        ))}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" /> Monthly Report
            </CardTitle>
            <CardDescription>
              CSV containing the month&apos;s summary, daily activity, per-user totals, action
              breakdown and the full audit trail.
            </CardDescription>
          </div>
          <Button variant="outline" render={<a href={`/api/reports/activity?month=${month}`} />}>
            <Download className="h-4 w-4" /> Generate CSV
          </Button>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <BarChart3 className="mr-2 inline h-4 w-4" />
          Covers {monthLabel(month)} · {total} action(s) from {activeUsers} user(s).
        </CardContent>
      </Card>
    </div>
  );
}
