"use client";

import { useState } from "react";
import { Sigma } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WEIGHTS, type TeamScore } from "@/lib/performance";

const f2 = (v: number) => v.toFixed(2);
const scoreColor = (score: number) => (score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444");

function TeamMath({ t }: { t: TeamScore }) {
  const sum =
    WEIGHTS.stability * t.stability +
    WEIGHTS.quality * t.quality +
    WEIGHTS.attendance * t.attendance -
    WEIGHTS.sickness * t.sickness -
    WEIGHTS.backlog * t.backlog;
  const reviewed = t.approved + t.rejected;
  const scheduled = t.workedShifts + t.sickShifts + t.otherLeaveShifts;

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-6 w-6 justify-center p-0 font-mono text-[11px]">
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
      <div className="space-y-1 font-mono text-xs text-muted-foreground">
        <div>
          S = 1 − ({t.actions} ÷ {t.members}) ÷ {t.maxActionsPerMember.toFixed(2)} ={" "}
          <span className="text-foreground">{f2(t.stability)}</span>
          <span className="italic"> — fewer changes per member than the busiest team = calmer roster</span>
        </div>
        <div>
          Q = {t.approved} ÷ ({t.approved} + {t.rejected}) ={" "}
          <span className="text-foreground">{f2(t.quality)}</span>
          {reviewed === 0 && <span className="italic"> — nothing needed reviewing → 1</span>}
        </div>
        <div>
          T = {t.workedShifts} ÷ ({t.workedShifts} + {t.sickShifts} + {t.otherLeaveShifts}) ={" "}
          <span className="text-foreground">{f2(t.attendance)}</span>
          {scheduled === 0 && <span className="italic"> — no roster → neutral 0.5</span>}
        </div>
        <div>
          H = {t.sickShifts} ÷ {scheduled || 0} ={" "}
          <span className="text-foreground">{f2(t.sickness)}</span>
          <span className="italic"> — sick days ÷ scheduled (penalty)</span>
        </div>
        <div>
          B = {t.pending} ÷ {t.maxPending} ={" "}
          <span className="text-foreground">{f2(t.backlog)}</span>
          {t.maxPending === 0 && <span className="italic"> — nothing pending anywhere</span>}
        </div>
        <div className="border-t pt-1.5 text-foreground">
          Score = 100 × ({WEIGHTS.stability}×{f2(t.stability)} + {WEIGHTS.quality}×
          {f2(t.quality)} + {WEIGHTS.attendance}×{f2(t.attendance)} − {WEIGHTS.sickness}×
          {f2(t.sickness)} − {WEIGHTS.backlog}×{f2(t.backlog)})
        </div>
        <div>
          &nbsp;&nbsp;&nbsp;&nbsp;= 100 × {f2(sum)} ≈{" "}
          <span className="font-bold" style={{ color: scoreColor(t.score) }}>
            {t.score.toFixed(1)}
          </span>{" "}
          (clamped to 0–100)
        </div>
      </div>
    </div>
  );
}

/**
 * "View math" popup showing the step-by-step team performance calculation.
 * Rendered by the analytics page for ADMIN only.
 */
export function PerformanceMathDialog({
  monthLabelStr, teams,
}: {
  monthLabelStr: string;
  teams: TeamScore[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-2" />}>
        <Sigma className="h-4 w-4" /> View math
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Performance mathematics — {monthLabelStr}</DialogTitle>
          <DialogDescription>
            Exact step-by-step calculation behind each team&apos;s score.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/50 p-3 text-center font-mono text-[13px]">
          Score = 100 × ( {WEIGHTS.stability}·S + {WEIGHTS.quality}·Q +{" "}
          {WEIGHTS.attendance}·T − {WEIGHTS.sickness}·H − {WEIGHTS.backlog}·B )
        </div>

        <div className="space-y-3">
          {teams.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No teams to calculate for this month.
            </p>
          ) : (
            teams.map((t) => <TeamMath key={t.teamName} t={t} />)
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          S = stability (fewer roster changes per member than the busiest team = better) ·
          Q = quality (approval rate; 1 when nothing was reviewed) · T = attendance (worked ÷
          scheduled) · H = sickness (sick days ÷ scheduled, penalty) · B = backlog (pending vs
          worst team, penalty). Sign-ins don&apos;t count as changes; teams with no roster get a
          neutral 0.5 attendance.
        </p>
      </DialogContent>
    </Dialog>
  );
}
