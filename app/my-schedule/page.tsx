import { connectDB } from "@/lib/mongodb";
import { requireSession } from "@/lib/auth";
import { UserModel, RosterMonthModel, ShiftRequestModel, TeamModel } from "@/models";
import { monthKey, monthLabel, isWorkCode, daysInMonth, addDays } from "@/lib/shifts";
import { AppShell } from "@/components/app-shell";
import { MySchedule } from "@/components/my-schedule";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarOff } from "lucide-react";

export default async function MySchedulePage() {
  const session = await requireSession();
  await connectDB();

  const thisMonth = monthKey();
  const nextMonth = monthKey(addDays(1));

  const [rosterThis, rosterNext, myRequests, me] = await Promise.all([
    RosterMonthModel().findOne({ month: thisMonth }),
    RosterMonthModel().findOne({ month: nextMonth }),
    ShiftRequestModel().find({ requester: session.userId }).sort({ createdAt: -1 }).limit(20),
    UserModel().findById(session.userId),
    session.teamId ? TeamModel().findById(session.teamId) : null,
  ]);

  const roster = rosterThis ?? rosterNext;
  const activeMonth = rosterThis ? thisMonth : rosterNext?.month ?? thisMonth;

  if (!roster || !me) {
    return (
      <AppShell user={{ fullName: session.fullName, username: session.username, role: session.role, employeeCode: session.employeeCode }}>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <CalendarOff className="h-10 w-10" />
            <p className="font-medium text-foreground">No roster published yet</p>
            <p className="text-sm">Your manager hasn&apos;t built the schedule. Check back soon.</p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const myEntry = roster.entries.find((e) => String(e.employee) === String(me._id));
  const shifts = myEntry?.shifts ?? [];

  // teammates for swap (same team, exclude self)
  const teammatesDocs = session.teamId
    ? await UserModel().find({
        _id: { $ne: me._id },
        team: session.teamId,
        role: { $in: ["EMPLOYEE", "TEAM_LEADER"] },
        active: true,
      })
    : [];
  const teammates = teammatesDocs.map((t) => ({
    _id: String(t._id),
    fullName: t.fullName,
    employeeCode: t.employeeCode ?? "",
    shiftOnDate: "" as string,
  }));

  const today = new Date();
  const todayCode = activeMonth === thisMonth ? (shifts[today.getDate() - 1] ?? "") : "";
  const tomorrow = addDays(1);
  const tomorrowIsThisMonth = tomorrow.getMonth() + 1 === Number(activeMonth.slice(5, 7)) && tomorrow.getFullYear() === Number(activeMonth.slice(0, 4));
  const tomorrowCode = tomorrowIsThisMonth ? (shifts[tomorrow.getDate() - 1] ?? "") : "";

  // upcoming work days (next 14 days)
  const upcoming: { day: number; date: Date; code: string }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(i);
    const mk = monthKey(d);
    if (mk !== activeMonth) continue;
    const code = shifts[d.getDate() - 1] ?? "";
    if (isWorkCode(code)) upcoming.push({ day: d.getDate(), date: d, code });
  }

  // time off this month
  const timeOff: { day: number; code: string }[] = [];
  shifts.forEach((code, idx) => {
    if (code && !isWorkCode(code) && code !== "DO") timeOff.push({ day: idx + 1, code });
  });

  const requestRows = myRequests.map((r) => ({
    _id: String(r._id),
    type: r.type,
    status: r.status,
    month: r.month,
    date: r.date,
    reason: r.reason,
    currentShift: r.currentShift,
    requestedShift: r.requestedShift,
    targetShift: r.targetShift,
  }));

  return (
    <AppShell user={{ fullName: session.fullName, username: session.username, role: session.role, employeeCode: session.employeeCode }}>
      <MySchedule
        month={activeMonth}
        monthLabelStr={monthLabel(activeMonth)}
        days={daysInMonth(activeMonth)}
        shifts={shifts}
        todayCode={todayCode}
        tomorrowCode={tomorrowCode}
        tomorrowLabel={tomorrow.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        todayLabel={today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        todayDay={today.getDate()}
        upcoming={upcoming.map((u) => ({
          day: u.day,
          code: u.code,
          label: u.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        }))}
        timeOff={timeOff}
        myCode={me.employeeCode ?? ""}
        fullName={session.fullName}
        teammates={teammates}
        requests={requestRows}
      />
    </AppShell>
  );
}
