import { NextResponse } from "next/server";
import { UserModel, RosterMonthModel, TeamModel } from "@/models";
import { getSession } from "@/lib/auth";
import { daysInMonth, monthKey } from "@/lib/shifts";

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
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

  const dim = daysInMonth(month);
  const roster = await RosterMonthModel().findOne({ month });
  const users = await UserModel().find({
    role: { $in: ["EMPLOYEE", "TEAM_LEADER"] },
    active: true,
  });
  const teams = await TeamModel().find();
  const teamName = new Map(teams.map((t) => [String(t._id), t.name]));

  const header = [
    "employeeCode",
    "fullName",
    "team",
    ...Array.from({ length: dim }, (_, i) => `Day${i + 1}`),
  ];

  const rows = users.map((u) => {
    const entry = roster?.entries.find((e) => String(e.employee) === String(u._id));
    const shifts = Array.from({ length: dim }, (_, i) => entry?.shifts[i] ?? "");
    return [
      u.employeeCode ?? "",
      u.fullName,
      u.team ? (teamName.get(String(u.team)) ?? "") : "",
      ...shifts,
    ].map(csvEscape).join(",");
  });

  const csv = [header.join(","), ...rows].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="roster-${month}.csv"`,
    },
  });
}
