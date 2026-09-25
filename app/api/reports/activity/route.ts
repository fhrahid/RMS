import { NextResponse } from "next/server";
import {
  AuditLogModel, UserModel, TeamModel, RosterMonthModel, ShiftRequestModel, RosterChangeModel,
} from "@/models";
import { getSession } from "@/lib/auth";
import { daysInMonth, monthKey, monthLabel, isWorkCode, ROLE_LABEL, type Role } from "@/lib/shifts";
import {
  computeTeamPerformance, computeEmployeeMetrics, WEIGHTS,
  type TeamInput, type EmployeeInput,
} from "@/lib/performance";

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

interface LogRow {
  actorName: string;
  action: string;
  target: string;
  details: string;
  createdAt: Date;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MANAGER") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const month = /^\d{4}-\d{2}$/.test(searchParams.get("month") ?? "")
    ? searchParams.get("month")!
    : monthKey();

  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);

  const [logs, users, teams, roster, monthRequests, monthProposals] = await Promise.all([
    AuditLogModel()
      .find({ createdAt: { $gte: start, $lt: end } })
      .sort({ createdAt: 1 })
      .limit(10000)
      .lean() as unknown as Promise<LogRow[]>,
    UserModel().find().select("fullName role team"),
    TeamModel().find().select("name"),
    RosterMonthModel().findOne({ month }),
    ShiftRequestModel().find({ month }).select("status requester"),
    RosterChangeModel().find({ month }).select("status employee"),
  ]);

  const teamName = new Map(teams.map((t) => [String(t._id), t.name]));
  const roleOf = new Map(users.map((u) => [u.fullName, u.role]));
  const teamOf = new Map(
    users.map((u) => [
      u.fullName,
      u.team ? (teamName.get(String(u.team)) ?? "") : "",
    ])
  );

  // Per-user summary
  const CATEGORIES = ["roster", "request", "user", "team", "auth"] as const;
  const perUser = new Map<string, { total: number; byCat: Record<string, number> }>();
  const perDay = new Array(daysInMonth(month)).fill(0) as number[];
  const perAction = new Map<string, number>();

  for (const log of logs) {
    const name = log.actorName || "(unknown)";
    const entry = perUser.get(name) ?? { total: 0, byCat: {} };
    entry.total++;
    const cat = log.action.split(".")[0];
    entry.byCat[cat] = (entry.byCat[cat] ?? 0) + 1;
    perUser.set(name, entry);

    const day = new Date(log.createdAt);
    if (!Number.isNaN(day.getTime()) && day >= start && day < end) {
      perDay[day.getDate() - 1]++;
    }
    perAction.set(log.action, (perAction.get(log.action) ?? 0) + 1);
  }

  const userRows = [...perUser.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, s]) =>
      [
        name,
        roleOf.get(name) ?? "",
        teamOf.get(name) ?? "",
        s.total,
        ...CATEGORIES.map((c) => s.byCat[c] ?? 0),
        Object.entries(s.byCat)
          .filter(([c]) => !CATEGORIES.includes(c as (typeof CATEGORIES)[number]))
          .map(([c, n]) => `${c}:${n}`)
          .join(" "),
      ]
        .map((v) => csvEscape(String(v)))
        .join(",")
    );

  const summary = [
    ["Total actions", logs.length],
    ["Users with activity", perUser.size],
    ["Busiest day", perDay.length ? perDay.indexOf(Math.max(...perDay)) + 1 : 0],
    ["Actions on busiest day", Math.max(...perDay, 0)],
  ]
    .map(([k, v]) => `${csvEscape(String(k))},${v}`)
    .join("\r\n");

  const dailyRow = `Actions per day,${perDay.join(",")}`;

  // ---- Team performance (same model as the analytics page) ----------------
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

  const teamRows = teamScores.map((t) =>
    [
      `#${t.rank}`, t.teamName, t.members, t.score.toFixed(1),
      `${Math.round(t.stability * 100)}%`, `${Math.round(t.quality * 100)}%`,
      `${Math.round(t.attendance * 100)}%`, `${Math.round(t.sickness * 100)}%`,
      `${Math.round(t.backlog * 100)}%`,
      t.actions, t.requestsSubmitted, t.approved, t.rejected, t.pending,
      t.workedShifts, t.sickShifts, t.otherLeaveShifts,
    ]
      .map((v) => csvEscape(String(v)))
      .join(",")
  );

  // ---- Per-employee metrics ------------------------------------------------
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

  const employeeRows = employeeScores.map((e) =>
    [
      e.name, e.teamName, e.role, e.actions,
      e.requestsSubmitted, e.approved, e.rejected, e.pending,
      e.workedDays, e.sickDays, e.otherLeaveDays, e.daysOff, e.missedDays,
      e.attendance === null ? "" : `${Math.round(e.attendance * 100)}%`,
      e.flags.join("; "),
    ]
      .map((v) => csvEscape(String(v)))
      .join(",")
  );

  const trail = logs
    .map((log) =>
      [
        new Date(log.createdAt).toISOString(),
        log.actorName,
        log.action,
        log.target,
        log.details,
      ]
        .map((v) => csvEscape(String(v ?? "")))
        .join(",")
    )
    .join("\r\n");

  const csv = [
    csvEscape(`Roster MS — Activity Report — ${monthLabel(month)}`),
    `Generated,${new Date().toISOString()}`,
    `Generated by,${csvEscape(`${session.fullName} (${session.role})`)}`,
    "",
    "SUMMARY",
    summary,
    "",
    `DAILY ACTIVITY (day 1-${daysInMonth(month)})`,
    dailyRow,
    "",
    "TEAM PERFORMANCE",
    `Model,${csvEscape(`Score = 100 x (${WEIGHTS.stability}*S + ${WEIGHTS.quality}*Q + ${WEIGHTS.attendance}*T - ${WEIGHTS.sickness}*H - ${WEIGHTS.backlog}*B)`)}`,
    "Rank,Team,Members,Score,Stability,Quality,Attendance,Sickness,Backlog,Changes,Requests,Approved,Rejected,Pending,WorkedShifts,SickShifts,OtherLeave",
    ...teamRows,
    "",
    "EMPLOYEE METRICS",
    "Employee,Team,Role,Changes,Requests,Approved,Rejected,Pending,WorkedDays,SickDays,OtherLeave,DaysOff,MissedDays,Attendance,Flags",
    ...employeeRows,
    "",
    "PER-USER SUMMARY",
    `User,Role,Team,Total,${CATEGORIES.map((c) => c[0].toUpperCase() + c.slice(1)).join(",")},Other`,
    ...userRows,
    "",
    "ACTION TYPE BREAKDOWN",
    "Action,Count",
    ...[...perAction.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([action, n]) => `${csvEscape(action)},${n}`),
    "",
    "FULL AUDIT TRAIL",
    "Timestamp,Actor,Action,Target,Details",
    trail,
  ].join("\r\n");

  return new NextResponse("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activity-report-${month}.csv"`,
    },
  });
}
