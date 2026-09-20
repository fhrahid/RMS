import { connectDB } from "@/lib/mongodb";
import { UserModel, TeamModel, RosterMonthModel, RosterChangeModel } from "@/models";
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
  const editMode = canEdit && session.role === "TEAM_LEADER" ? "proposal" : "direct";

  const rosters = await RosterMonthModel().find().sort({ month: -1 }).limit(24);
  const months = rosters.map((r) => r.month);
  const selected = month && months.includes(month) ? month : months[0] ?? monthKey();

  const roster = months.includes(selected)
    ? rosters.find((r) => r.month === selected)!
    : null;

  // Team leaders only see and stage changes for their own team's rows.
  type RosterEntry = NonNullable<typeof roster>["entries"][number];
  let entries: RosterEntry[] = roster ? [...roster.entries] : [];
  if (editMode === "proposal") {
    const ledTeam = await TeamModel().findOne({ leader: session.userId });
    const ledTeamId = ledTeam ? String(ledTeam._id) : session.teamId;
    if (ledTeamId) {
      const members = await UserModel().find({ team: ledTeamId }, "_id");
      const memberSet = new Set(members.map((m) => String(m._id)));
      entries = entries.filter((e) => memberSet.has(String(e.employee)));
    } else {
      entries = [];
    }
  }

  const [employees, pendingCells] = await Promise.all([
    entries.length
      ? UserModel().find({
          _id: { $in: entries.map((e) => e.employee) },
        }).populate<{ team: { name: string } | null }>("team", "name")
      : Promise.resolve([]),
    canEdit
      ? RosterChangeModel().find({ status: "PENDING", month: selected }).select("employee day")
      : Promise.resolve([]),
  ]);

  const rows = entries
    .map((entry) => {
      const u = employees.find(
        (e) => String(e._id) === String(entry.employee)
      );
      if (!u) return null;
      return {
        userId: String(u._id),
        fullName: u.fullName,
        employeeCode: u.employeeCode ?? "",
        team: (u.team as { name: string } | null)?.name ?? "",
        shifts: entry.shifts ?? [],
        editable: canEdit,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Roster</h1>
        <p className="text-sm text-muted-foreground">
          {!canEdit
            ? "View-only — roster edits are done by Admin, Manager, or Team Leader."
            : editMode === "proposal"
              ? "Click any cell to stage a shift — cells turn amber. Hit “Save changes” (bottom-right) to send the batch for approval."
              : "Click any cell to set a shift instantly. Changes are logged to the audit trail."}
        </p>
      </div>

      <RosterGrid
        months={months.length ? months : [monthKey()]}
        selectedMonth={selected}
        monthLabelStr={monthLabel(selected)}
        rows={rows}
        days={roster?.daysInMonth ?? 31}
        canEdit={canEdit}
        canCreate={canEdit}
        editMode={editMode}
        pendingCells={pendingCells.map((p) => `${String(p.employee)}:${p.day}`)}
      />
    </div>
  );
}
