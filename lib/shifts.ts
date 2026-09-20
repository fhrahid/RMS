export const ROLES = ["ADMIN", "MANAGER", "TEAM_LEADER", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  TEAM_LEADER: "Team Leader",
  EMPLOYEE: "Employee",
};

export const SHIFT_MAP: Record<string, string> = {
  M2: "08:00–17:00",
  M3: "09:00–18:00",
  M4: "10:00–19:00",
  D1: "12:00–21:00",
  D2: "13:00–22:00",
  DO: "Day Off",
  SL: "Sick Leave",
  CL: "Casual Leave",
  EL: "Emergency Leave",
  HL: "Holiday Leave",
};

export const WORK_CODES = ["M2", "M3", "M4", "D1", "D2"] as const;
export const ALL_CODES = [...WORK_CODES, "DO", "SL", "CL", "EL", "HL"] as const;
export type ShiftCode = (typeof ALL_CODES)[number];

export function shiftLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return SHIFT_MAP[code] ?? code;
}

export function isWorkCode(code: string | null | undefined): boolean {
  return !!code && (WORK_CODES as readonly string[]).includes(code);
}

/** "YYYY-MM" for a date */
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/** Nearest "YYYY-MM" from a list to today (or current month) */
export function currentOrNearestMonth(keys: string[]): string {
  const cur = monthKey();
  if (keys.includes(cur)) return cur;
  return [...keys].sort().reduce((best, k) =>
    Math.abs(new Date(k + "-01").getTime() - Date.now()) <
    Math.abs(new Date(best + "-01").getTime() - Date.now())
    ? k
    : best
  , keys[0] ?? cur);
}

export function dayDate(month: string, day: number): Date {
  return new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, day);
}

export function addDays(n: number, from: Date = new Date()): Date {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + n);
}
