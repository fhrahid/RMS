"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Inbox } from "lucide-react";
import { reviewRequest } from "@/app/actions/requests";
import { shiftLabel, monthLabel } from "@/lib/shifts";

interface Row {
  _id: string;
  type: "CHANGE" | "SWAP";
  month: string;
  date: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason: string;
  currentShift: string;
  requestedShift: string;
  targetShift: string;
  requesterName: string;
  requesterCode: string;
  targetName: string | null;
  reviewedByName: string | null;
  createdAt: string;
}

const STATUS_STYLE: Record<Row["status"], string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
};

export function RequestsPanel({ rows, canReview }: { rows: Row[]; canReview: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function review(id: string, decision: "approve" | "reject") {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("requestId", id);
      fd.set("decision", decision);
      const res = await reviewRequest({} as never, fd);
      if (res?.error) toast.error(res.error);
      else {
        toast.success(res?.success ?? "Done");
        router.refresh();
      }
    });
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <Inbox className="h-8 w-8" />
          <p className="text-sm">No requests yet.</p>
        </CardContent>
      </Card>
    );
  }

  const order = { PENDING: 0, APPROVED: 1, REJECTED: 2 };
  const sorted = [...rows].sort(
    (a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt)
  );

  return (
    <div className="space-y-3">
      {sorted.map((r) => (
        <Card key={r._id}>
          <CardContent className="flex flex-wrap items-center gap-3 py-4">
            <Badge variant="outline" className={STATUS_STYLE[r.status]}>
              {r.status}
            </Badge>
            <Badge variant="secondary" className="font-mono">
              {r.type}
            </Badge>

            <div className="min-w-[240px] flex-1">
              <div className="text-sm font-medium">
                {r.requesterName}
                {r.requesterCode && (
                  <span className="ml-1.5 font-mono text-xs text-muted-foreground">{r.requesterCode}</span>
                )}
                {r.type === "SWAP" && r.targetName && (
                  <span className="text-muted-foreground"> ↔ {r.targetName}</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {monthLabel(r.month)}, day {r.date} —{" "}
                {r.type === "CHANGE"
                  ? `${shiftLabel(r.currentShift) || "—"} → ${shiftLabel(r.requestedShift)}`
                  : `${shiftLabel(r.currentShift) || "—"} ↔ ${shiftLabel(r.targetShift) || "—"}`}
              </div>
              <div className="mt-1 text-xs italic text-muted-foreground">“{r.reason}”</div>
              {r.reviewedByName && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Reviewed by {r.reviewedByName}
                </div>
              )}
            </div>

            {r.status === "PENDING" && canReview && (
              <div className="flex gap-2">
                <Button size="sm" disabled={pending} onClick={() => review(r._id, "approve")}>
                  <Check className="h-4 w-4" /> Approve
                </Button>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => review(r._id, "reject")}>
                  <X className="h-4 w-4" /> Reject
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
