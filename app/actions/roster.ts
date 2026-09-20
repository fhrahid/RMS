"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserModel, TeamModel, RosterMonthModel } from "@/models";
import { assertRoles, logAudit } from "./auth";
import { ALL_CODES, daysInMonth } from "@/lib/shifts";
import type { ActionState } from "./shared";

const setShiftSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  userId: z.string().min(1),
  day: z.coerce.number().int().min(1).max(31),
  code: z.enum(ALL_CODES).or(z.literal("")),
});

/** Resolve the team a TEAM_LEADER manages (led team first, own membership as fallback). */
async function ledTeamIdFor(userId: string): Promise<string | null> {
  const led = await TeamModel().findOne({ leader: userId });
  if (led) return String(led._id);
  const me = await UserModel().findById(userId, "team");
  return me?.team ? String(me.team) : null;
}

export async function setShift(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertRoles(["ADMIN", "MANAGER", "TEAM_LEADER"]);
    const { month, userId, day, code } = setShiftSchema.parse(Object.fromEntries(formData.entries()));
    const dim = daysInMonth(month);
    if (day > dim) return { error: "Invalid day for this month" };

    if (session.role === "TEAM_LEADER") {
      const teamId = await ledTeamIdFor(session.userId);
      const target = await UserModel().findById(userId, "team");
      if (!teamId || !target || String(target.team ?? "") !== teamId) {
        return { error: "Team leaders can only edit shifts for their own team" };
      }
    }

    const roster = await RosterMonthModel().findOne({ month });
    if (!roster) return { error: "Roster for this month does not exist yet" };

    const entry = roster.entries.find((e) => String(e.employee) === userId);
    if (!entry) return { error: "Employee is not part of this roster" };

    while (entry.shifts.length < dim) entry.shifts.push("");
    const old = entry.shifts[day - 1] ?? "";
    entry.shifts[day - 1] = code;
    roster.markModified("entries");
    await roster.save();

    const emp = await UserModel().findById(userId);
    await logAudit(
      session,
      "roster.setShift",
      emp ? `${emp.fullName} (${emp.employeeCode ?? emp.username})` : userId,
      `${month} day ${day}: ${old || "—"} → ${code || "—"}`
    );
    revalidatePath("/admin/roster");
    revalidatePath("/admin");
    revalidatePath("/my-schedule");
    return { success: `Saved ${emp?.fullName ?? "employee"} — day ${day}: ${code || "cleared"}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save shift" };
  }
}
