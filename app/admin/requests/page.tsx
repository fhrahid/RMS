import { connectDB } from "@/lib/mongodb";
import { ShiftRequestModel } from "@/models";
import { requireSession } from "@/lib/auth";
import { RequestsPanel } from "@/components/requests-panel";

export default async function RequestsPage() {
  const session = await requireSession();
  await connectDB();
  const canReview = session.role === "ADMIN" || session.role === "MANAGER";

  const requests = await ShiftRequestModel()
    .find()
    .sort({ createdAt: -1 })
    .limit(100)
    .populate<{ requester: { fullName: string; employeeCode?: string } }>("requester", "fullName employeeCode")
    .populate<{ target: { fullName: string; employeeCode?: string } | null }>("target", "fullName employeeCode")
    .populate<{ reviewedBy: { fullName: string } | null }>("reviewedBy", "fullName");

  const rows = requests.map((r) => ({
    _id: String(r._id),
    type: r.type,
    month: r.month,
    date: r.date,
    status: r.status,
    reason: r.reason,
    currentShift: r.currentShift,
    requestedShift: r.requestedShift,
    targetShift: r.targetShift,
    requesterName: r.requester?.fullName ?? "—",
    requesterCode: r.requester?.employeeCode ?? "",
    targetName: r.target?.fullName ?? null,
    reviewedByName: (r.reviewedBy as { fullName?: string } | null)?.fullName ?? null,
    createdAt: r.createdAt?.toISOString() ?? "",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Requests</h1>
        <p className="text-sm text-muted-foreground">
          {canReview
            ? "Approving a CHANGE rewrites the roster; approving a SWAP exchanges both shifts."
            : "View-only — approvals are done by Admin or Manager."}
        </p>
      </div>
      <RequestsPanel rows={rows} canReview={canReview} />
    </div>
  );
}
