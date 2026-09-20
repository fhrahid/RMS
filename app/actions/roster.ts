"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserModel, RosterMonthModel } from "@/models";
import { assertRoles, logAudit } from "./auth";
import { ALL_CODES, daysInMonth } from "@/lib/shifts";
import type { ActionState } from "./shared";

const setShiftSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  userId: z.string().min(1),
  day: z.coerce.number().int().min(1).max(31),
  code: z.enum(ALL_CODES).or(z.literal("")),
});

const createMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

/** Scaffold an empty roster month (all active employees) for any month — no date restrictions. */
export async function createRosterMonth(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertRoles(["ADMIN", "MANAGER", "TEAM_LEADER"]);
    const { month } = createMonthSchema.parse({ month: formData.get("month") });

    const existing = await RosterMonthModel().findOne({ month });
    if (existing) return { error: `Roster for ${month} already exists` };

    const dim = daysInMonth(month);
    const employees = await UserModel().find({
      role: { $in: ["EMPLOYEE", "TEAM_LEADER"] },
      active: true,
    });
    await RosterMonthModel().create({
      month,
      daysInMonth: dim,
      entries: employees.map((e) => ({
        employee: e._id,
        shifts: Array.from({ length: dim }, () => ""),
      })),
    });

    await logAudit(session, "roster.createMonth", month, `${employees.length} employees scaffolded`);
    revalidatePath("/admin/roster");
    revalidatePath("/admin");
    revalidatePath("/my-schedule");
    return { success: `Roster created for ${month} (${employees.length} employees)` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create roster month" };
  }
}

export async function setShift(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertRoles(["ADMIN", "MANAGER"]);
    const { month, userId, day, code } = setShiftSchema.parse(Object.fromEntries(formData.entries()));
    const dim = daysInMonth(month);
    if (day > dim) return { error: "Invalid day for this month" };

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
