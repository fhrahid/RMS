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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { setShift } from "@/app/actions/roster";
import { ALL_CODES, SHIFT_MAP, WORK_CODES, dayDate, monthLabel } from "@/lib/shifts";

interface Row {
  userId: string;
  fullName: string;
  employeeCode: string;
  team: string;
  shifts: string[];
  editable?: boolean;
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
  months, selectedMonth, monthLabelStr, rows, days, canEdit,
}: {
  months: string[];
  selectedMonth: string;
  monthLabelStr: string;
  rows: Row[];
  days: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cell, setCell] = useState<{ row: Row; day: number } | null>(null);

  function onMonthChange(m: string) {
    startTransition(() => router.push(`/admin/roster?month=${m}`));
  }

  function weekday(day: number) {
    return dayDate(selectedMonth, day).toLocaleDateString("en-US", { weekday: "short" })[0];
  }
  function isWeekend(day: number) {
    const wd = dayDate(selectedMonth, day).getDay();
    return wd === 0 || wd === 6;
  }
  const todayDay = selectedMonth === new Date().toISOString().slice(0, 7) ? new Date().getDate() : 0;

  function pick(code: string) {
    if (!cell) return;
    const { row, day } = cell;
    setCell(null);
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
  }

  return (
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
                    No roster for this month yet. Import a CSV from the CSV page or ask an admin to
                    create the month.
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
                    return (
                      <td key={d} className="border-b border-l p-0.5">
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => editable && setCell({ row, day: d })}
                          className={`flex h-8 w-full items-center justify-center rounded font-mono text-[11px] font-semibold transition-colors ${
                            code
                              ? CODE_COLOR[code] ?? "bg-muted"
                              : "text-muted-foreground/40 hover:bg-muted"
                          } ${editable ? "cursor-pointer hover:ring-2 hover:ring-primary/40" : "cursor-default"} ${
                            d === todayDay ? "ring-1 ring-primary/40" : ""
                          }`}
                          title={code ? SHIFT_MAP[code] : "Empty"}
                        >
                          {code || "·"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  );
}
