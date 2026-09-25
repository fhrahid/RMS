/**
 * Performance model — team & employee
 * =====================================
 * Philosophy: a well-planned roster needs FEW changes. Every roster edit,
 * shift request, proposal or review is a symptom of instability, and sick
 * days are missed workdays. So performance rewards calm, present teams:
 *
 *   S  (Stability)   = 1 − (team changes per member ÷ most-changed team's per-capita)
 *   Q  (Quality)     = approved ÷ (approved + rejected)      [1 if nothing reviewed]
 *   T  (Attendance)  = worked ÷ (worked + sick + other leave) [0.5 if no roster]
 *   H  (Sickness)    = sick days ÷ scheduled days             [0 if no roster]
 *   B  (Backlog)     = pending ÷ worst team's pending         [0 if none pending]
 *
 *   Score = 100 × clamp( W_S·S + W_Q·Q + W_T·T − W_H·H − W_B·B , 0, 1 )
 *
 * Positive weights sum to exactly 1.00, so a perfect team scores 100.
 * H is an extra penalty on top of T: chronic sick leave drags the score
 * down harder than planned leave. Changes = non-auth audit actions
 * (roster edits, requests, proposals, reviews…); sign-ins don't count.
 */

export interface TeamInput {
  teamName: string;
  /** Members in the team. */
  members: number;
  /** Change actions made by members (audit actions excluding sign-ins). */
  actions: number;
  /** Shift requests submitted by members. */
  requestsSubmitted: number;
  /** Members' requests + proposals that were approved. */
  approved: number;
  rejected: number;
  pending: number;
  /** Scheduled shifts actually worked (work codes). */
  workedShifts: number;
  /** Sick-leave days (SL). */
  sickShifts: number;
  /** Other leave days (CL/EL/HL). */
  otherLeaveShifts: number;
}

export interface TeamScore extends TeamInput {
  /** Normalized factors, each 0–1. */
  stability: number;
  quality: number;
  attendance: number;
  sickness: number;
  backlog: number;
  /** Final score, 0–100 (1 decimal). */
  score: number;
  /** Rank, 1 = best. */
  rank: number;
  /** Raw changes per member (unnormalized stability input). */
  actionsPerMember: number;
  /** Worst per-capita changes across all teams (normalizer for S). */
  maxActionsPerMember: number;
  /** Highest pending count across all teams (normalizer for B). */
  maxPending: number;
}

export const WEIGHTS = {
  stability: 0.35,
  quality: 0.15,
  attendance: 0.5,
  sickness: 0.15,
  backlog: 0.1,
} as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

export function computeTeamPerformance(inputs: TeamInput[]): TeamScore[] {
  // Per-capita so larger teams don't win (or lose) by headcount alone.
  const perCapita = inputs.map((t) => (t.members > 0 ? t.actions / t.members : 0));
  const maxActionsPerMember = Math.max(...perCapita, 0);
  const maxPending = Math.max(...inputs.map((t) => t.pending), 0);

  const scored: TeamScore[] = inputs.map((t, i) => {
    // Fewer changes than the busiest team → higher stability.
    const stability =
      maxActionsPerMember > 0 ? 1 - perCapita[i] / maxActionsPerMember : 1;
    const reviewed = t.approved + t.rejected;
    const quality = reviewed > 0 ? t.approved / reviewed : 1;
    const scheduled = t.workedShifts + t.sickShifts + t.otherLeaveShifts;
    const attendance = scheduled > 0 ? t.workedShifts / scheduled : 0.5;
    const sickness = scheduled > 0 ? t.sickShifts / scheduled : 0;
    const backlog = maxPending > 0 ? t.pending / maxPending : 0;

    const raw =
      WEIGHTS.stability * stability +
      WEIGHTS.quality * quality +
      WEIGHTS.attendance * attendance -
      WEIGHTS.sickness * sickness -
      WEIGHTS.backlog * backlog;

    return {
      ...t,
      stability,
      quality,
      attendance,
      sickness,
      backlog,
      score: round1(clamp01(raw) * 100),
      rank: 0,
      actionsPerMember: perCapita[i],
      maxActionsPerMember,
      maxPending,
    };
  });

  scored.sort((a, b) => b.score - a.score || a.teamName.localeCompare(b.teamName));
  scored.forEach((t, i) => {
    t.rank = i + 1;
  });
  return scored;
}

// ---------------------------------------------------------------------------
// Per-employee metrics
// ---------------------------------------------------------------------------

export interface EmployeeInput {
  name: string;
  teamName: string;
  /** Display role label, e.g. "Employee", "Team Leader". */
  role: string;
  /** Change actions the employee made (excluding sign-ins). */
  actions: number;
  requestsSubmitted: number;
  approved: number;
  rejected: number;
  pending: number;
  /** Days worked (work codes) from the roster. */
  workedDays: number;
  /** Sick-leave days (SL). */
  sickDays: number;
  /** Other leave days (CL/EL/HL). */
  otherLeaveDays: number;
  /** Scheduled days off (DO). */
  daysOff: number;
}

export interface EmployeeScore extends EmployeeInput {
  /** sickDays + otherLeaveDays — scheduled days the employee missed. */
  missedDays: number;
  /** worked ÷ (worked + missed); null when there is no roster for them. */
  attendance: number | null;
  /** Superlatives, e.g. "Most sick days", "Best attendance". */
  flags: string[];
  /** Rank by attendance (1 = best). */
  rank: number;
}

export function computeEmployeeMetrics(inputs: EmployeeInput[]): EmployeeScore[] {
  const scored: EmployeeScore[] = inputs.map((e) => {
    const missedDays = e.sickDays + e.otherLeaveDays;
    const scheduled = e.workedDays + missedDays;
    const attendance = scheduled > 0 ? e.workedDays / scheduled : null;
    return { ...e, missedDays, attendance, flags: [], rank: 0 };
  });

  // Best attendance first; ties broken by fewer missed days, then fewer requests.
  scored.sort((a, b) => {
    const av = a.attendance ?? -1;
    const bv = b.attendance ?? -1;
    if (bv !== av) return bv - av;
    if (a.missedDays !== b.missedDays) return a.missedDays - b.missedDays;
    if (b.requestsSubmitted !== a.requestsSubmitted) {
      return b.requestsSubmitted - a.requestsSubmitted;
    }
    return a.name.localeCompare(b.name);
  });
  scored.forEach((e, i) => {
    e.rank = i + 1;
  });

  const maxSick = Math.max(0, ...scored.map((e) => e.sickDays));
  const maxRequests = Math.max(0, ...scored.map((e) => e.requestsSubmitted));
  const busiest = scored.reduce(
    (m, e) => (e.actions > m ? e.actions : m),
    0
  );
  const best = scored.find((e) => e.attendance !== null && e.attendance >= 0.9);

  for (const e of scored) {
    if (maxSick > 0 && e.sickDays === maxSick) e.flags.push("Most sick days");
    if (maxRequests > 0 && e.requestsSubmitted === maxRequests) {
      e.flags.push("Most requests");
    }
    if (busiest > 0 && e.actions === busiest) e.flags.push("Most changes");
    if (e === best) e.flags.push("Best attendance");
  }
  return scored;
}
