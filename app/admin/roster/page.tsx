import { connectDB } from "@/lib/mongodb";
import { UserModel, TeamModel, RosterMonthModel } from "@/models";
import { requireSession } from "@/lib/auth";
import { monthKey, monthLabel } from "@/lib/shifts";
import { RosterGrid } from "@/components/roster-grid";

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await requireSession();
  const { month } = await searchParams;
  await connectDB();

  const canEdit = session.role !== "EMPLOYEE";

  const rosters = await RosterMonthModel().find().sort({ month: -1 }).limit(24);
  const months = rosters.map((r) => r.month);
  const selected = month && months.includes(month) ? month : months[0] ?? monthKey();

  const roster = months.includes(selected)
    ? rosters.find((r) => r.month === selected)!
    : null;

  const ledTeam =
    session.role === "TEAM_LEADER" ? await TeamModel().findOne({ leader: session.userId }) : null;
  const ledTeamId = ledTeam ? String(ledTeam._id) : session.teamId;

  const employeeIds = roster
    ? roster.entries.map((e) => String(e.employee))
    : [];
  const employees = roster
    ? await UserModel().find({ _id: { $in: employeeIds } })
        .populate<{ team: { _id: unknown; name: string } | null }>("team", "name")
    : [];

  const rows = roster
    ? roster.entries
        .map((entry) => {
          const u = employees.find(
            (e) => String(e._id) === String(entry.employee)
          );
          if (!u) return null;
          const teamId = u.team ? String(u.team._id) : null;
          const ownTeam =
            session.role !== "TEAM_LEADER" ||
            (!!teamId && teamId === ledTeamId);
          return {
            userId: String(u._id),
            fullName: u.fullName,
            employeeCode: u.employeeCode ?? "",
            team: u.team?.name ?? "",
            shifts: entry.shifts ?? [],
            editable: canEdit && ownTeam,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Roster</h1>
        <p className="text-sm text-muted-foreground">
          {canEdit
            ? "Click any cell to set a shift. Changes are logged to the audit trail."
            : "View-only — roster edits are done by Admin, Manager, or Team Leader."}
        </p>
      </div>

      <RosterGrid
        months={months.length ? months : [monthKey()]}
        selectedMonth={selected}
        monthLabelStr={monthLabel(selected)}
        rows={rows}
        days={roster?.daysInMonth ?? 31}
        canEdit={canEdit}
      />
    </div>
  );
}
