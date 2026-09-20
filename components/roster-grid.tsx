"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Save, X, Loader2, ClipboardList } from "lucide-react";
import { setShift, createRosterMonth } from "@/app/actions/roster";
import { submitRosterProposalBatch } from "@/app/actions/approvals";
import { ALL_CODES, SHIFT_MAP, WORK_CODES, dayDate, monthLabel } from "@/lib/shifts";

interface Row {
  userId: string;
  fullName: string;
  employeeCode: string;
  team: string;
  shifts: string[];
  editable?: boolean;
}

interface StagedChange {
  month: string;
  userId: string;
  employeeName: string;
  day: number;
  oldCode: string;
  code: string;
}

const CODE_COLOR: Record<string, string> = {
  M2: "bg-blue-50 text-blue-700 border-blue-200",
  M3: "bg-violet-50 text-violet-700 border-violet-200",
  M4: "bg-purple-50 text-purple-700 border-purple-200",
  D1: "bg-amber-50 text-amber-700 border-amber-200",
  D2: "bg-orange-50 text-orange-700 border-orange-200",
  DO: "bg-slate-50 text-slate-500 border-slate-200",
  SL: "bg-red-50 text-red-700 border-red-200",
  CL: "bg-pink-50 text-pink-700 border-pink-200",
  EL: "bg-rose-50 text-rose-700 border-rose-200",
  HL: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export function RosterGrid({
  months, selectedMonth, monthLabelStr, rows, days, canEdit, canCreate = false,
  editMode = "direct", pendingCells = [],
}: {
  months: string[];
  selectedMonth: string;
  monthLabelStr: string;
  rows: Row[];
  days: number;
  canEdit: boolean;
  canCreate?: boolean;
  editMode?: "direct" | "proposal";
  pendingCells?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cell, setCell] = useState<{ row: Row; day: number } | null>(null);
  const [staged, setStaged] = useState<Record<string, StagedChange>>({});
  const [newMonth, setNewMonth] = useState(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const next = new Date(y, m, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  });

  const stagedEntries = Object.entries(staged);
  const stagedCount = stagedEntries.length;

  function onMonthChange(m: string) {
    startTransition(() => router.push(`/admin/roster?month=${m}`));
  }

  function createMonth() {
    if (!newMonth) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("month", newMonth);
      const res = await createRosterMonth({} as never, fd);
      if (res?.error) toast.error(res.error);
      else {
        toast.success(res?.success ?? "Created");
        router.push(`/admin/roster?month=${newMonth}`);
        router.refresh();
      }
    });
  }

  function pick(code: string) {
    if (!cell) return;
    const { row, day } = cell;
    setCell(null);

    if (editMode !== "proposal") {
      startTransition(async () => {
        const fd = new FormData();
        fd.set("month", selectedMonth);
        fd.set("userId", row.userId);
        fd.set("day", String(day));
        fd.set("code", code);
        const res = await setShift({} as never, fd);
        if (res?.error) toast.error(res.error);
        else {
          toast.success(res?.success ?? "Saved");
          router.refresh();
        }
      });
      return;
    }

    const key = `${selectedMonth}:${row.userId}:${day}`;
    setStaged((prev) => ({
      ...prev,
      [key]: {
        month: selectedMonth,
        userId: row.userId,
        employeeName: row.fullName,
        day,
        oldCode: row.shifts[day - 1] ?? "",
        code,
      },
    }));
  }

  function unstage(key: string) {
    setStaged((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function saveSession() {
    if (stagedCount === 0) return;
    startTransition(async () => {
      const fd = new FormData();
      for (const [, s] of stagedEntries) {
        fd.append("items", `${s.month}|${s.userId}|${s.day}|${s.code}`);
      }
      const res = await submitRosterProposalBatch({} as never, fd);
      if (res?.error) toast.error(res.error);
      else {
        toast.success(res?.success ?? "Submitted for approval");
        setStaged({});
        router.refresh();
      }
    });
  }

  function weekday(day: number) {
    return dayDate(selectedMonth, day).toLocaleDateString("en-US", { weekday: "short" })[0];
  }
  function isWeekend(day: number) {
    const wd = dayDate(selectedMonth, day).getDay();
    return wd === 0 || wd === 6;
  }
  const todayDay = selectedMonth === new Date().toISOString().slice(0, 7) ? new Date().getDate() : 0;

  return (
    <>
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Select value={selectedMonth} onValueChange={(v) => { if (v) onMonthChange(v); }} disabled={pending}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-1.5">
              {ALL_CODES.map((c) => (
                <Badge key={c} variant="outline" className={`font-mono text-[10px] ${CODE_COLOR[c]}`}>
                  {c}
                </Badge>
              ))}
            </div>
          </div>

          {canCreate && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="month"
                className="w-44"
                value={newMonth}
                onChange={(e) => setNewMonth(e.target.value)}
                disabled={pending}
              />
              <Button variant="outline" size="sm" onClick={createMonth} disabled={pending || !newMonth}>
                <Plus className="h-4 w-4" /> New roster month
              </Button>
              <span className="text-xs text-muted-foreground">
                Scaffolds an empty roster for any month (all active employees). No date limits.
              </span>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-muted/60">
                  <th className="sticky left-0 z-20 min-w-[200px] border-b bg-muted/60 px-3 py-2 text-left font-medium">
                    Employee
                  </th>
                  {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
                    <th
                      key={d}
                      className={`border-b border-l px-1 py-1.5 text-center font-medium ${
                        d === todayDay ? "bg-primary/10 text-primary" : isWeekend(d) ? "text-muted-foreground" : ""
                      }`}
                    >
                      <div className="text-[10px] font-normal">{weekday(d)}</div>
                      <div>{d}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={days + 1} className="px-4 py-10 text-center text-muted-foreground">
                      {canCreate
                        ? "No roster for this month yet — create one with “New roster month” above, or import a CSV from the CSV page."
                        : "No roster for this month yet. Import a CSV from the CSV page or ask an admin to create the month."}
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.userId} className="group hover:bg-muted/40">
                    <td className="sticky left-0 z-10 border-b bg-card px-3 py-1.5 group-hover:bg-muted/40">
                      <div className="text-sm font-medium leading-tight">{row.fullName}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {row.employeeCode}
                        {row.team ? ` · ${row.team}` : ""}
                      </div>
                    </td>
                    {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                      const code = row.shifts[d - 1] ?? "";
                      const editable = canEdit && row.editable !== false;
                      const stagedItem = staged[`${selectedMonth}:${row.userId}:${d}`];
                      const shownCode = stagedItem?.code ?? code;
                      const isPending = pendingCells.includes(`${row.userId}:${d}`);
                      const isStaged = !!stagedItem;
                      return (
                        <td key={d} className="border-b border-l p-0.5">
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() => editable && setCell({ row, day: d })}
                            className={`flex h-8 w-full items-center justify-center rounded border-2 font-mono text-[11px] font-semibold transition-colors ${
                              isStaged
                                ? "border-amber-500 bg-amber-100 text-amber-900"
                                : shownCode
                                  ? CODE_COLOR[shownCode] ?? "bg-muted"
                                  : "text-muted-foreground/40 hover:bg-muted"
                            } ${!isStaged && !shownCode ? "border-transparent" : ""} ${
                              !isStaged && shownCode ? "border-transparent" : ""
                            } ${
                              editable ? "cursor-pointer hover:ring-2 hover:ring-primary/40" : "cursor-default"
                            } ${d === todayDay ? "ring-1 ring-primary/40" : ""} ${
                              isPending && !isStaged ? "border-amber-400" : ""
                            }`}
                            title={
                              isStaged
                                ? `Staged: ${stagedItem.oldCode || "—"} → ${stagedItem.code} (save session to submit)`
                                : isPending
                                  ? `${code ? SHIFT_MAP[code] : "Empty"} · change pending approval`
                                  : code
                                    ? SHIFT_MAP[code]
                                    : "Empty"
                            }
                          >
                            {shownCode || "·"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {editMode === "proposal" && (
          <p className="text-xs text-muted-foreground">
            Solid amber = staged in your session · outlined amber = already submitted, awaiting approval.
          </p>
        )}
      </CardContent>

        <Dialog open={!!cell} onOpenChange={(o) => !o && setCell(null)}>
          <DialogContent className="max-w-sm">
            {cell && (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {cell.row.fullName} — {monthLabelStr}, day {cell.day}
                  </DialogTitle>
                  <DialogDescription>
                    {dayDate(selectedMonth, cell.day).toLocaleDateString("en-US", {
                      weekday: "long", month: "long", day: "numeric",
                    })}
                    {cell.row.shifts[cell.day - 1]
                      ? ` · current: ${cell.row.shifts[cell.day - 1]}`
                      : " · currently empty"}
                  </DialogDescription>
                </DialogHeader>
                {editMode === "proposal" && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Staged in your session (bottom-right). Click “Save changes” to submit everything
                    for Admin/Manager approval — the roster only changes after they approve.
                  </p>
                )}
                <div className="grid grid-cols-4 gap-2">
                  {ALL_CODES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => pick(c)}
                      className={`rounded-lg border p-2 text-center font-mono text-sm font-semibold transition-transform hover:scale-105 ${
                        CODE_COLOR[c]
                      }`}
                      title={SHIFT_MAP[c]}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <DialogFooter className="justify-between sm:justify-between">
                  <span className="text-xs text-muted-foreground">
                    Work codes: {WORK_CODES.join(", ")}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setCell(null)}>
                    Cancel
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </Card>

      {editMode === "proposal" && stagedCount > 0 && (
        <div className="fixed bottom-4 right-4 z-50 w-80 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between border-b bg-muted/60 px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardList className="h-4 w-4 text-primary" />
              Roster session
              <Badge variant="secondary">{stagedCount}</Badge>
            </div>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">unsaved</span>
          </div>
          <ul className="max-h-40 overflow-y-auto px-3 py-2 text-xs">
            {stagedEntries.map(([key, s]) => (
              <li key={key} className="flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-muted/40">
                <span className="truncate">
                  <span className="font-medium">{s.employeeName}</span>
                  <span className="text-muted-foreground">
                    {" "}· {s.month}, day {s.day}: {s.oldCode || "—"} → {s.code}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => unstage(key)}
                  className="shrink-0 text-muted-foreground hover:text-red-600"
                  aria-label={`Remove ${s.employeeName} day ${s.day}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t px-3 py-2.5">
            <Button variant="ghost" size="sm" onClick={() => setStaged({})} disabled={pending}>
              Discard
            </Button>
            <Button size="sm" onClick={saveSession} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
