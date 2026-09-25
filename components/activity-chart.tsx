"use client";

import { useState } from "react";
import { BarChart3, CalendarDays, LineChart as LineChartIcon, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { dayDate, monthLabel } from "@/lib/shifts";

export interface DailyPoint {
  day: number;
  count: number;
}

export interface UserPoint {
  name: string;
  role: string;
  count: number;
}

/** Round a max value up to a "nice" grid maximum. */
function niceMax(v: number): number {
  if (v <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (v <= m * pow) return m * pow;
  }
  return 10 * pow;
}

/** Value color scale: quiet → busy. */
const SCALE = ["#94a3b8", "#22d3ee", "#3b82f6", "#8b5cf6", "#ec4899"];
function colorFor(v: number, max: number): string {
  if (v <= 0) return SCALE[0];
  return SCALE[Math.min(SCALE.length - 1, 1 + Math.floor((v / max) * (SCALE.length - 1)))];
}

/** Rotating palette for the per-user chart. */
const ROW_COLORS = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
];

const W = 900;
const H = 300;
const PAD = { l: 42, r: 12, t: 16, b: 30 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

function Grid({ max }: { max: number }) {
  const rows = [0, 1, 2, 3, 4];
  return (
    <g>
      {rows.map((i) => {
        const y = PAD.t + PLOT_H - (i / 4) * PLOT_H;
        const value = (max / 4) * i;
        return (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="var(--border)" strokeWidth={1} />
            <text
              x={PAD.l - 6} y={y + 3} textAnchor="end" fontSize={10}
              className="fill-muted-foreground"
            >
              {Number.isInteger(value) ? value : value.toFixed(1)}
            </text>
          </g>
        );
      })}
      <line
        x1={PAD.l} x2={W - PAD.r} y1={PAD.t + PLOT_H} y2={PAD.t + PLOT_H}
        stroke="var(--border)" strokeWidth={1}
      />
    </g>
  );
}

/** Dashed amber line marking the daily average is drawn inline in each chart. */

function ScaleLegend({ avg }: { avg: number }) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        quieter
        <span className="flex items-center gap-0.5">
          {SCALE.map((c) => (
            <span key={c} className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: c }} />
          ))}
        </span>
        busier
      </span>
      {avg > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-5 border-t-2 border-dashed border-amber-500" />
          daily average ({avg.toFixed(1)})
        </span>
      )}
    </div>
  );
}

function DailyBarChart({
  data, month, avg,
}: {
  data: DailyPoint[];
  month: string;
  avg: number;
}) {
  const max = niceMax(Math.max(...data.map((d) => d.count), 1));
  const slot = PLOT_W / data.length;
  const barW = Math.max(4, slot * 0.7);
  const labelStep = data.length > 16 ? 2 : 1;
  const avgY = PAD.t + PLOT_H - (avg / max) * PLOT_H;
  const label = monthLabel(month);

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Daily actions bar chart">
        <defs>
          <linearGradient id="barTop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <Grid max={max} />
        {data.map((d) => {
          const h = max ? (d.count / max) * PLOT_H : 0;
          const x = PAD.l + slot * (d.day - 1) + (slot - barW) / 2;
          const y = PAD.t + PLOT_H - h;
          const when = dayDate(month, d.day);
          const weekday = when.toLocaleDateString("en-US", { weekday: "short" });
          return (
            <g key={d.day}>
              <rect
                x={x} y={y} width={barW} height={Math.max(h, d.count > 0 ? 2 : 0)}
                rx={3} fill={colorFor(d.count, max)}
              >
                <title>
                  {`${weekday}, ${label} ${d.day}: ${d.count} action${d.count === 1 ? "" : "s"}`}
                </title>
              </rect>
              {d.count > 0 && h > 14 && (
                <rect
                  x={x} y={y} width={barW} height={Math.min(h, 12)}
                  rx={3} fill="url(#barTop)" pointerEvents="none"
                />
              )}
              {d.day % labelStep === 0 && (
                <text
                  x={x + barW / 2} y={H - 10} textAnchor="middle" fontSize={9}
                  className="fill-muted-foreground"
                >
                  {d.day}
                </text>
              )}
            </g>
          );
        })}
        {avg > 0 && (
          <g pointerEvents="none">
            <line
              x1={PAD.l} x2={W - PAD.r} y1={avgY} y2={avgY}
              stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 4"
            />
            <text
              x={W - PAD.r} y={avgY - 5} textAnchor="end" fontSize={10} fill="#f59e0b"
              fontWeight={600}
            >
              avg {avg.toFixed(1)}
            </text>
          </g>
        )}
      </svg>
      <ScaleLegend avg={avg} />
    </>
  );
}

function DailyLineChart({
  data, month, avg,
}: {
  data: DailyPoint[];
  month: string;
  avg: number;
}) {
  const rawMax = Math.max(...data.map((d) => d.count), 1);
  const max = niceMax(rawMax);
  const slot = PLOT_W / data.length;
  const x = (day: number) => PAD.l + slot * (day - 0.5);
  const y = (count: number) => PAD.t + PLOT_H - (max ? (count / max) * PLOT_H : 0);

  const points = data.map((d) => `${x(d.day)},${y(d.count)}`).join(" ");
  const bottom = PAD.t + PLOT_H;
  const area = `M ${x(1)},${bottom} L ${points} L ${x(data.length)},${bottom} Z`;
  const labelStep = data.length > 16 ? 2 : 1;
  const avgY = PAD.t + PLOT_H - (avg / max) * PLOT_H;
  const label = monthLabel(month);

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Daily actions line chart">
        <defs>
          <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <Grid max={max} />
        <path d={area} fill="url(#lineFill)" />
        <polyline
          points={points} fill="none" stroke="#8b5cf6" strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round"
        />
        {data.map((d) => {
          const when = dayDate(month, d.day);
          const weekday = when.toLocaleDateString("en-US", { weekday: "short" });
          return (
            <g key={d.day}>
              <circle
                cx={x(d.day)} cy={y(d.count)} r={3.5}
                fill={colorFor(d.count, rawMax)}
                stroke="var(--background)" strokeWidth={1.5}
              >
                <title>
                  {`${weekday}, ${label} ${d.day}: ${d.count} action${d.count === 1 ? "" : "s"}`}
                </title>
              </circle>
              {d.day % labelStep === 0 && (
                <text
                  x={x(d.day)} y={H - 10} textAnchor="middle" fontSize={9}
                  className="fill-muted-foreground"
                >
                  {d.day}
                </text>
              )}
            </g>
          );
        })}
        {avg > 0 && (
          <g pointerEvents="none">
            <line
              x1={PAD.l} x2={W - PAD.r} y1={avgY} y2={avgY}
              stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 4"
            />
            <text
              x={W - PAD.r} y={avgY - 5} textAnchor="end" fontSize={10} fill="#f59e0b"
              fontWeight={600}
            >
              avg {avg.toFixed(1)}
            </text>
          </g>
        )}
      </svg>
      <ScaleLegend avg={avg} />
    </>
  );
}

function UserBarChart({ data }: { data: UserPoint[] }) {
  const rowH = 36;
  const nameW = 170;
  const padR = 56;
  const height = Math.max(data.length * rowH + 14, 80);
  const max = Math.max(...data.map((d) => d.count), 1);
  const plotW = W - nameW - padR;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img"
      aria-label="Actions per user bar chart"
    >
      <defs>
        {ROW_COLORS.map((c, i) => (
          <linearGradient key={i} id={`userBar${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity="0.65" />
            <stop offset="100%" stopColor={c} />
          </linearGradient>
        ))}
      </defs>
      {data.map((u, i) => {
        const y = i * rowH + 8;
        const barW = Math.max(2, (u.count / max) * plotW);
        const name = u.name.length > 24 ? `${u.name.slice(0, 23)}…` : u.name;
        const color = ROW_COLORS[i % ROW_COLORS.length];
        return (
          <g key={`${u.name}-${i}`}>
            <text x={nameW - 8} y={y + 14} textAnchor="end" fontSize={11} className="fill-foreground">
              {name}
            </text>
            <text x={nameW - 8} y={y + 26} textAnchor="end" fontSize={9} className="fill-muted-foreground">
              {u.role}
            </text>
            <rect
              x={nameW} y={y} width={plotW} height={22} rx={4}
              fill="var(--muted)"
            />
            <rect
              x={nameW} y={y} width={barW} height={22} rx={4}
              fill={`url(#userBar${i % ROW_COLORS.length})`}
            >
              <title>{`${u.name} (${u.role}): ${u.count} action${u.count === 1 ? "" : "s"}`}</title>
            </rect>
            <text
              x={nameW + barW + 6} y={y + 15} fontSize={11} fill={color}
              className="font-semibold"
            >
              {u.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ActivityChart({
  month, daily, byUser, totalActions,
}: {
  month: string;
  daily: DailyPoint[];
  byUser: UserPoint[];
  totalActions: number;
}) {
  const [visible, setVisible] = useState(true);
  const [dataset, setDataset] = useState<"daily" | "users">("daily");
  const [chartType, setChartType] = useState<"bar" | "line">("bar");

  const monthLabelStr = monthLabel(month);
  const total = daily.reduce((n, d) => n + d.count, 0);
  const avg = total / Math.max(daily.length, 1);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" /> Activity Graph
          </CardTitle>
          <CardDescription>
            {dataset === "daily"
              ? `Actions per day — ${monthLabelStr} (color shows how busy the day was)`
              : `Actions per user — ${monthLabelStr} (top 10)`}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm" variant={dataset === "daily" ? "default" : "outline"}
            onClick={() => setDataset("daily")}
          >
            <CalendarDays className="h-4 w-4" /> Daily
          </Button>
          <Button
            size="sm" variant={dataset === "users" ? "default" : "outline"}
            onClick={() => setDataset("users")}
          >
            <Users className="h-4 w-4" /> Per user
          </Button>
          {dataset === "daily" && (
            <Button
              size="sm" variant={chartType === "line" ? "default" : "outline"}
              onClick={() => setChartType(chartType === "bar" ? "line" : "bar")}
              aria-label="Toggle chart type"
            >
              {chartType === "bar" ? (
                <><LineChartIcon className="h-4 w-4" /> Line</>
              ) : (
                <><BarChart3 className="h-4 w-4" /> Bars</>
              )}
            </Button>
          )}
          <div className="flex items-center gap-2 border-l pl-3">
            <Switch id="graph-toggle" checked={visible} onCheckedChange={setVisible} />
            <Label htmlFor="graph-toggle" className="text-sm">Show graph</Label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {totalActions === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No activity recorded for {monthLabelStr} yet.
          </p>
        ) : !visible ? (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <BarChart3 className="h-8 w-8" />
            <p className="text-sm">Graph hidden — use the “Show graph” toggle to display it.</p>
          </div>
        ) : dataset === "daily" ? (
          chartType === "bar" ? (
            <DailyBarChart data={daily} month={month} avg={avg} />
          ) : (
            <DailyLineChart data={daily} month={month} avg={avg} />
          )
        ) : (
          <UserBarChart data={byUser.slice(0, 10)} />
        )}
      </CardContent>
    </Card>
  );
}
