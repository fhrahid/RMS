import { connectDB } from "@/lib/mongodb";
import { UserModel, RosterMonthModel, RosterChangeModel } from "@/models";
import { requireRoles } from "@/lib/auth";
import { monthLabel, daysInMonth } from "@/lib/shifts";
import { ApprovalsPanel } from "@/components/approvals-panel";

export default async function ApprovalsPage() {
  await requireRoles("ADMIN", "MANAGER");
  await connectDB();

  // Note: intentionally NOT populating "employee" here — we fetch users manually
  // below, and String(populatedDoc) would corrupt the ids used for the query.
  const pending = await RosterChangeModel()
    .find({ status: "PENDING" })
    .sort({ createdAt: 1 })
    .limit(500)
    .populate<{ proposedBy: { fullName: string } | null }>("proposedBy", "fullName");

  const history = await RosterChangeModel()
    .find({ status: { $ne: "PENDING" } })
    .sort({ reviewedAt: -1 })
    .limit(30)
    .populate<{ employee: { fullName: string; employeeCode?: string } }>("employee", "fullName employeeCode")
    .populate<{ proposedBy: { fullName: string } | null }>("proposedBy", "fullName")
    .populate<{ reviewedBy: { fullName: string } | null }>("reviewedBy", "fullName");

  // Group pending proposals by month, then attach the surrounding roster rows
  // so reviewers see changes on the actual calendar.
  const byMonth = new Map<string, typeof pending>();
  for (const p of pending) {
    const list = byMonth.get(p.month) ?? [];
    list.push(p);
    byMonth.set(p.month, list);
  }

  const monthsPayload = [];
  for (const month of [...byMonth.keys()].sort().reverse()) {
    const items = byMonth.get(month)!;
    const roster = await RosterMonthModel().findOne({ month });
    const empIds = [...new Set(items.map((i) => String(i.employee)))];
    const employees = roster
      ? await UserModel().find({ _id: { $in: empIds } }).populate<{ team: { name: string } | null }>("team", "name")
      : [];

    const rows = empIds
      .map((id) => {
        const u = employees.find((e) => String(e._id) === id);
        if (!u) return null;
        const entry = roster?.entries.find((e) => String(e.employee) === id);
        const cellMap = new Map<number, {
          ids: string[]; oldCode: string; newCode: string; byNames: string[];
        }>();
        for (const it of items) {
          if (String(it.employee) !== id) continue;
          const c = cellMap.get(it.day) ?? {
            ids: [], oldCode: it.oldCode, newCode: it.newCode, byNames: [],
          };
          c.ids.push(String(it._id));
          c.byNames.push(it.proposedBy?.fullName ?? "—");
          c.newCode = it.newCode;
          cellMap.set(it.day, c);
        }
        return {
          userId: id,
          fullName: u.fullName,
          employeeCode: u.employeeCode ?? "",
          team: (u.team as { name: string } | null)?.name ?? "",
          shifts: (entry?.shifts ?? []) as string[],
          cells: [...cellMap.entries()]
            .map(([day, c]) => ({ day, ...c }))
            .sort((a, b) => a.day - b.day),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));

    monthsPayload.push({
      month,
      monthLabelStr: monthLabel(month),
      days: roster?.daysInMonth ?? daysInMonth(month),
      rows,
    });
  }

  const historyRows = history.map((p) => ({
    _id: String(p._id),
    employeeName: p.employee?.fullName ?? "—",
    employeeCode: p.employee?.employeeCode ?? "",
    team: "",
    month: p.month,
    day: p.day,
    oldCode: p.oldCode,
    newCode: p.newCode,
    proposedByName: p.proposedBy?.fullName ?? "—",
    createdAt: p.createdAt?.toISOString() ?? "",
    status: p.status as "APPROVED" | "REJECTED",
    reviewedByName: p.reviewedBy?.fullName ?? null,
    reviewedAt: p.reviewedAt?.toISOString() ?? "",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Roster changes proposed by team leaders, shown on the calendar. Click amber cells to
          select them, then approve or reject in bulk.
        </p>
      </div>
      <ApprovalsPanel months={monthsPayload} historyRows={historyRows} />
    </div>
  );
}
