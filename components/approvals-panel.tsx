"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Check, X, ClipboardCheck, Loader2 } from "lucide-react";
import { reviewRosterChanges } from "@/app/actions/approvals";
import { monthLabel, shiftLabel } from "@/lib/shifts";

export interface ApprovalCell {
  day: number;
  ids: string[];
  oldCode: string;
  newCode: string;
  byNames: string[];
}

export interface ApprovalRow {
  userId: string;
  fullName: string;
  employeeCode: string;
  team: string;
  shifts: string[];
  cells: ApprovalCell[];
}

export interface ApprovalsMonth {
  month: string;
  monthLabelStr: string;
  days: number;
  rows: ApprovalRow[];
}

export interface DecisionRow {
  _id: string;
  employeeName: string;
  employeeCode: string;
  month: string;
  day: number;
  oldCode: string;
  newCode: string;
  proposedByName: string;
  status: "APPROVED" | "REJECTED";
  reviewedByName: string | null;
  reviewedAt: string;
}

const STATUS_STYLE = {
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
} as const;

export function ApprovalsPanel({
  months,
  historyRows,
}: {
  months: ApprovalsMonth[];
  historyRows: DecisionRow[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [activeMonth, setActiveMonth] = useState(months[0]?.month ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const active = months.find((m) => m.month === activeMonth) ?? months[0];

  const totalPending = useMemo(
    () => months.reduce((n, m) => n + m.rows.reduce((k, r) => k + r.cells.length, 0), 0),
    [months]
  );

  const cellKey = (month: string, userId: string, day: number) => `${month}:${userId}:${day}`;

  const activeCellCount = active
    ? active.rows.reduce((k, r) => k + r.cells.length, 0)
    : 0;
  const allSelected = activeCellCount > 0 && selected.size >= activeCellCount;

  const selectedIds = useMemo(() => {
    if (!active) return [];
    const ids: string[] = [];
    for (const row of active.rows) {
      for (const c of row.cells) {
        if (selected.has(cellKey(active.month, row.userId, c.day))) ids.push(...c.ids);
      }
    }
    return ids;
  }, [active, selected]);

  function toggle(month: string, userId: string, day: number) {
    const key = cellKey(month, userId, day);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllCurrent() {
    if (!active) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const row of active.rows) {
        for (const c of row.cells) next.add(cellKey(active.month, row.userId, c.day));
      }
      return next;
    });
  }

  function deselectAll() {
    setSelected(new Set());
  }

  function decide(decision: "approve" | "reject") {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("decision", decision);
      for (const id of selectedIds) fd.append("ids", id);
      const res = await reviewRosterChanges({} as never, fd);
      if (res?.error) toast.error(res.error);
      else {
        toast.success(res?.success ?? "Done");
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  function weekday(m: string, day: number) {
    return new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, day)
      .toLocaleDateString("en-US", { weekday: "short" })[0];
  }

  return (
    <Tabs defaultValue="pending">
      <TabsList>
        <TabsTrigger value="pending">
          Pending <Badge variant="secondary" className="ml-1">{totalPending}</Badge>
        </TabsTrigger>
        <TabsTrigger value="history">Recent decisions</TabsTrigger>
      </TabsList>

      <TabsContent value="pending">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="h-4 w-4 text-primary" /> Proposed roster changes
              </CardTitle>
              <CardDescription>
                Click amber cells to select; approving writes them onto the roster immediately.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllCurrent}
                disabled={!active || allSelected}
              >
                Select all
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={deselectAll}
                disabled={selected.size === 0}
              >
                <X className="h-4 w-4" /> Deselect all
              </Button>
              <Button size="sm" disabled={busy || selectedIds.length === 0} onClick={() => decide("approve")}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Approve
              </Button>
              <Button size="sm" variant="outline" disabled={busy || selectedIds.length === 0} onClick={() => decide("reject")}>
                <X className="h-4 w-4" /> Reject
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {months.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                <ClipboardCheck className="h-8 w-8" />
                <p className="text-sm">No pending roster changes — all caught up.</p>
              </div>
            ) : (
              <>
                <Select
                  value={active?.month}
                  onValueChange={(v) => {
                    if (!v) return;
                    setActiveMonth(v);
                    setSelected(new Set());
                  }}
                >
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem key={m.month} value={m.month}>{m.monthLabelStr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {active && (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-muted/60">
                          <th className="sticky left-0 z-20 min-w-[200px] border-b bg-muted/60 px-3 py-2 text-left font-medium">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={activeCellCount > 0 && selected.size >= activeCellCount}
                                onCheckedChange={(c) => (c ? selectAllCurrent() : deselectAll())}
                                disabled={!active}
                                aria-label="Select all proposed changes"
                              />
                              Employee
                            </div>
                          </th>
                          {Array.from({ length: active.days }, (_, i) => i + 1).map((d) => (
                            <th key={d} className="border-b border-l px-1 py-1.5 text-center font-medium">
                              <div className="text-[10px] font-normal text-muted-foreground">
                                {weekday(active.month, d)}
                              </div>
                              <div>{d}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {active.rows.map((row) => {
                          const cellByDay = new Map(row.cells.map((c) => [c.day, c]));
                          return (
                            <tr key={row.userId} className="hover:bg-muted/40">
                              <td className="sticky left-0 z-10 border-b bg-card px-3 py-1.5">
                                <div className="text-sm font-medium leading-tight">{row.fullName}</div>
                                <div className="font-mono text-[10px] text-muted-foreground">
                                  {row.employeeCode}
                                  {row.team ? ` · ${row.team}` : ""}
                                </div>
                              </td>
                              {Array.from({ length: active.days }, (_, i) => i + 1).map((d) => {
                                const c = cellByDay.get(d);
                                const key = cellKey(active.month, row.userId, d);
                                const isSelected = selected.has(key);
                                if (!c) {
                                  return (
                                    <td key={d} className="border-b border-l p-0.5">
                                      <div
                                        className="flex h-8 w-full cursor-default items-center justify-center rounded border-2 border-transparent font-mono text-[11px] text-muted-foreground/40"
                                        title={row.shifts[d - 1] || "Empty"}
                                      >
                                        {row.shifts[d - 1] || "·"}
                                      </div>
                                    </td>
                                  );
                                }
                                return (
                                  <td key={d} className="border-b border-l p-0.5">
                                    <button
                                      type="button"
                                      onClick={() => toggle(active.month, row.userId, d)}
                                      className={`flex h-8 w-full items-center justify-center rounded border-2 border-amber-400 bg-amber-100 font-mono text-[11px] font-semibold text-amber-900 transition-colors ${
                                        isSelected ? "ring-2 ring-primary" : "hover:ring-2 hover:ring-primary/40"
                                      }`}
                                      title={`Day ${d}: ${c.oldCode || "—"} → ${c.newCode} (${shiftLabel(c.newCode)}) · by ${c.byNames.join(", ")}`}
                                    >
                                      {c.newCode}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Amber = proposed change (hover for current → proposed and proposer). Ringed = selected.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="history">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent decisions</CardTitle>
            <CardDescription>Latest approved or rejected proposals (30 most recent).</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {historyRows.length === 0 ? (
              <p className="px-6 py-8 text-sm text-muted-foreground">No decisions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3">Decided</th>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Change</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Reviewed by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((r) => (
                      <tr key={r._id} className="border-b last:border-b-0 hover:bg-muted/40">
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                          {new Date(r.reviewedAt).toLocaleString("en-US", {
                            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-2.5 font-medium">{r.employeeName}</td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          {monthLabel(r.month)}, day {r.day}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {r.oldCode || "—"} → {r.newCode}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className={STATUS_STYLE[r.status]}>
                            {r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.reviewedByName ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
