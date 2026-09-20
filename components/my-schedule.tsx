"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sun, Sunset, CalendarDays, CalendarOff, History, Inbox,
  Edit, Repeat, CheckCircle2, XCircle, Clock, Loader2,
} from "lucide-react";
import { submitChangeRequest, submitSwapRequest } from "@/app/actions/requests";
import { ALL_CODES, SHIFT_MAP, dayDate } from "@/lib/shifts";
import type { ActionState } from "@/app/actions/shared";

interface Teammate { _id: string; fullName: string; employeeCode: string; shiftOnDate: string }
interface RequestRow {
  _id: string; type: string; status: string; month: string; date: number;
  reason: string; currentShift: string; requestedShift: string; targetShift: string;
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

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
};

const init: ActionState = {};

export function MySchedule({
  month, monthLabelStr, days, shifts, todayCode, tomorrowCode,
  tomorrowLabel, todayLabel, todayDay, upcoming, timeOff, myCode, fullName,
  teammates, requests,
}: {
  month: string;
  monthLabelStr: string;
  days: number;
  shifts: string[];
  todayCode: string;
  tomorrowCode: string;
  tomorrowLabel: string;
  todayLabel: string;
  todayDay: number;
  upcoming: { day: number; code: string; label: string }[];
  timeOff: { day: number; code: string }[];
  myCode: string;
  fullName: string;
  teammates: Teammate[];
  requests: RequestRow[];
}) {
  const router = useRouter();
  const [changeOpen, setChangeOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [reqDay, setReqDay] = useState(todayDay);
  const [reqShift, setReqShift] = useState("");
  const [swapDay, setSwapDay] = useState(todayDay);
  const [swapTarget, setSwapTarget] = useState("");

  const [changeState, changeAction, changePending] = useActionState(submitChangeRequest, init);
  const [swapState, swapAction, swapPending] = useActionState(submitSwapRequest, init);

  useEffect(() => {
    for (const [s, close] of [[changeState, setChangeOpen], [swapState, setSwapOpen]] as const) {
      if (s?.error) toast.error(s.error);
      if (s?.success) {
        toast.success(s.success);
        close(false);
        router.refresh();
      }
    }
  }, [changeState, swapState, router]);

  function cellCode(day: number) {
    return shifts[day - 1] ?? "";
  }
  function onDayClick(day: number) {
    setReqDay(day);
    setSwapDay(day);
    setReqShift("");
    setSwapTarget("");
    setChangeOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Greeting + today/tomorrow */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-lg">Hi {fullName.split(" ")[0]} 👋</CardTitle>
              <CardDescription className="font-mono">{myCode}</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setChangeOpen(true)}>
                <Edit className="h-4 w-4" /> Request Change
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSwapOpen(true)}>
                <Repeat className="h-4 w-4" /> Request Swap
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sun className="h-4 w-4 text-amber-500" /> Today
                <span className="text-xs">({todayLabel})</span>
              </div>
              {todayCode
                ? <Badge variant="outline" className={`font-mono ${CODE_COLOR[todayCode]}`}>{todayCode}</Badge>
                : <span className="text-sm text-muted-foreground">—</span>}
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sunset className="h-4 w-4 text-orange-500" /> Tomorrow
                <span className="text-xs">({tomorrowLabel})</span>
              </div>
              {tomorrowCode
                ? <Badge variant="outline" className={`font-mono ${CODE_COLOR[tomorrowCode]}`}>{tomorrowCode}</Badge>
                : <span className="text-sm text-muted-foreground">—</span>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarOff className="h-4 w-4 text-primary" /> Time Off this month
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {timeOff.length === 0 && <p className="text-sm text-muted-foreground">No leaves scheduled.</p>}
            {timeOff.map((t) => (
              <Badge key={t.day} variant="outline" className={`gap-1 font-mono text-[10px] ${CODE_COLOR[t.code]}`}>
                {t.day}: {t.code}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Calendar + upcoming */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-primary" /> {monthLabelStr}
            </CardTitle>
            <CardDescription>Click a day to request a shift change</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1.5">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {d}
                </div>
              ))}
              {Array.from({ length: dayDate(month, 1).getDay() }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
                const code = cellCode(day);
                const isToday = day === todayDay;
                const wd = dayDate(month, day).getDay();
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => onDayClick(day)}
                    className={`flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-lg border p-1 transition-colors ${
                      code ? CODE_COLOR[code] ?? "bg-muted" : "bg-card"
                    } ${wd === 0 || wd === 6 ? "border-dashed" : ""} ${
                      isToday ? "ring-2 ring-primary" : ""
                    } hover:ring-2 hover:ring-primary/50`}
                    title={code ? SHIFT_MAP[code] : "No shift"}
                  >
                    <span className={`text-[10px] font-medium ${code ? "" : "text-muted-foreground"}`}>{day}</span>
                    <span className="font-mono text-xs font-bold">{code || "·"}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <History className="h-4 w-4 text-primary" /> Upcoming work days
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {upcoming.length === 0 && <p className="text-sm text-muted-foreground">No work days in the next two weeks.</p>}
            {upcoming.slice(0, 7).map((u) => (
              <div key={u.day} className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm">
                <span className="text-muted-foreground">{u.label}</span>
                <Badge variant="outline" className={`font-mono text-[10px] ${CODE_COLOR[u.code]}`}>{u.code}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* My requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="h-4 w-4 text-primary" /> My Requests
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {requests.length === 0 && (
            <p className="text-sm text-muted-foreground">No requests yet — use the buttons above.</p>
          )}
          {requests.map((r) => (
            <div key={r._id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              {r.status === "PENDING" && <Clock className="h-4 w-4 text-amber-500" />}
              {r.status === "APPROVED" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              {r.status === "REJECTED" && <XCircle className="h-4 w-4 text-red-600" />}
              <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[r.status]}`}>
                {r.status}
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px]">{r.type}</Badge>
              <span className="text-muted-foreground">{r.month}, day {r.date}</span>
              <span className="text-xs text-muted-foreground">
                {r.type === "CHANGE"
                  ? `${r.currentShift || "—"} → ${r.requestedShift}`
                  : `${r.currentShift || "—"} ↔ ${r.targetShift || "—"}`}
              </span>
              <span className="ml-auto text-xs italic text-muted-foreground">“{r.reason}”</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Change request dialog */}
      <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Request shift change</DialogTitle>
            <DialogDescription>
              {monthLabelStr}, day {reqDay} — current: {cellCode(reqDay) || "empty"}
            </DialogDescription>
          </DialogHeader>
          <form action={changeAction} className="space-y-3">
            <input type="hidden" name="month" value={month} />
            <input type="hidden" name="date" value={reqDay} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Day</Label>
                <Select value={String(reqDay)} onValueChange={(v) => v && setReqDay(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} ({dayDate(month, d).toLocaleDateString("en-US", { weekday: "short" })}) {cellCode(d) ? `· ${cellCode(d)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>New shift</Label>
                <input type="hidden" name="requestedShift" value={reqShift} />
                <Select value={reqShift} onValueChange={(v) => setReqShift(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Pick code" /></SelectTrigger>
                  <SelectContent>
                    {ALL_CODES.map((c) => (
                      <SelectItem key={c} value={c}>{c} — {SHIFT_MAP[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-reason">Reason</Label>
              <Textarea id="ch-reason" name="reason" placeholder="Why do you need this change?" required minLength={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setChangeOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={changePending || !reqShift}>
                {changePending && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Swap request dialog */}
      <Dialog open={swapOpen} onOpenChange={setSwapOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Request swap</DialogTitle>
            <DialogDescription>
              Swap your shift with a teammate on the same day.
            </DialogDescription>
          </DialogHeader>
          <form action={swapAction} className="space-y-3">
            <input type="hidden" name="month" value={month} />
            <input type="hidden" name="date" value={swapDay} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Day</Label>
                <Select value={String(swapDay)} onValueChange={(v) => v && setSwapDay(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} ({dayDate(month, d).toLocaleDateString("en-US", { weekday: "short" })}) · {cellCode(d) || "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Swap with</Label>
                <input type="hidden" name="targetId" value={swapTarget} />
                <Select value={swapTarget} onValueChange={(v) => setSwapTarget(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Teammate" /></SelectTrigger>
                  <SelectContent>
                    {teammates.map((t) => (
                      <SelectItem key={t._id} value={t._id}>
                        {t.fullName} ({t.employeeCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sw-reason">Reason</Label>
              <Textarea id="sw-reason" name="reason" placeholder="Why do you need this swap?" required minLength={3} />
            </div>
            {teammates.length === 0 && (
              <p className="text-xs text-muted-foreground">No teammates found in your team.</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSwapOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={swapPending || !swapTarget}>
                {swapPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
