"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserModel, TeamModel, RosterMonthModel, RosterChangeModel } from "@/models";
import { assertRoles, logAudit } from "./auth";
import { ALL_CODES, daysInMonth } from "@/lib/shifts";
import type { ActionState } from "./shared";

const batchItemSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  userId: z.string().min(1),
  day: z.coerce.number().int().min(1).max(31),
  code: z.enum(ALL_CODES),
});

/**
 * TEAM_LEADER: submit a whole staging session of roster cell changes in one go.
 * Each item is encoded as "month|userId|day|code". Cells are applied only
 * after an Admin/Manager approves them on the Approvals page.
 */
export async function submitRosterProposalBatch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertRoles(["TEAM_LEADER"]);
    const raw = formData.getAll("items").map(String);
    if (raw.length === 0) return { error: "No changes to submit" };

    const items: z.infer<typeof batchItemSchema>[] = [];
    for (const item of raw) {
      const [month, userId, day, code] = item.split("|");
      const r = batchItemSchema.safeParse({ month, userId, day, code });
      if (!r.success) return { error: "Invalid change payload" };
      items.push(r.data);
    }

    const monthKeys = [...new Set(items.map((i) => i.month))];
    const rosters = await RosterMonthModel().find({ month: { $in: monthKeys } });

    // A team leader may only propose changes for members of their own team.
    const led = await TeamModel().findOne({ leader: session.userId });
    const teamId = led ? String(led._id) : session.teamId;
    if (!teamId) return { error: "You are not assigned to a team yet" };

    const targetUsers = await UserModel().find(
      { _id: { $in: items.map((i) => i.userId) } },
      "team"
    );
    const teamOf = new Map(targetUsers.map((u) => [String(u._id), u.team ? String(u.team) : null]));

    let submitted = 0;
    let skipped = 0;
    for (const item of items) {
      const roster = rosters.find((r) => r.month === item.month);
      const entry = roster?.entries.find((e) => String(e.employee) === item.userId);
      if (!roster || !entry || item.day > daysInMonth(item.month)) {
        skipped++;
        continue;
      }
      if (teamOf.get(item.userId) !== teamId) {
        skipped++;
        continue;
      }
      const oldCode = entry.shifts[item.day - 1] ?? "";

      const existing = await RosterChangeModel().findOne({
        month: item.month,
        employee: item.userId,
        day: item.day,
        proposedBy: session.userId,
        status: "PENDING",
      });
      if (existing) {
        existing.oldCode = oldCode;
        existing.newCode = item.code;
        await existing.save();
      } else {
        await RosterChangeModel().create({
          month: item.month,
          employee: item.userId,
          day: item.day,
          oldCode,
          newCode: item.code,
          proposedBy: session.userId,
        });
      }
      submitted++;
    }

    if (submitted === 0) {
      return {
        error:
          skipped > 0
            ? "Nothing submitted — the employees you changed are not in your team"
            : "None of the changes could be submitted (roster or employee missing)",
      };
    }

    await logAudit(
      session,
      "roster.proposeBatch",
      monthKeys.join(", "),
      `${submitted} cell change(s) submitted for approval`
    );
    revalidatePath("/admin/roster");
    revalidatePath("/admin/approvals");
    return {
      success: `${submitted} change(s) submitted for approval${
        skipped > 0 ? `, ${skipped} skipped (not in your team)` : ""
      }`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to submit changes" };
  }
}

/** ADMIN/MANAGER: bulk-approve or bulk-reject pending roster proposals. */
export async function reviewRosterChanges(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertRoles(["ADMIN", "MANAGER"]);
    const ids = formData.getAll("ids").map(String).filter((s) => mongoose.isValidObjectId(s));
    const approve = String(formData.get("decision") ?? "") === "approve";
    if (ids.length === 0) return { error: "No changes selected" };

    const docs = await RosterChangeModel().find({ _id: { $in: ids }, status: "PENDING" });
    if (docs.length === 0) return { error: "Selected proposals are no longer pending" };

    const empIds = [...new Set(docs.map((d) => String(d.employee)))];
    const emps = await UserModel().find({ _id: { $in: empIds } }, "fullName employeeCode username");
    const nameOf = new Map(emps.map((u) => [String(u._id), `${u.fullName} (${u.employeeCode ?? u.username})`]));

    const months = [...new Set(docs.map((d) => d.month))];
    const rosters = await RosterMonthModel().find({ month: { $in: months } });

    const reviewerId = new mongoose.Types.ObjectId(session.userId);
    const decidedAt = new Date();
    const appliedCells: { month: string; employee: mongoose.Types.ObjectId; day: number }[] = [];
    let applied = 0;
    let skipped = 0;

    for (const p of docs) {
      const roster = rosters.find((r) => r.month === p.month);
      const entry = roster?.entries.find((e) => String(e.employee) === String(p.employee));

      if (approve && roster && entry) {
        while (entry.shifts.length < roster.daysInMonth) entry.shifts.push("");
        entry.shifts[p.day - 1] = p.newCode;
        roster.markModified("entries");
        await roster.save();
        applied++;
        appliedCells.push({ month: p.month, employee: p.employee, day: p.day });
      } else {
        skipped++;
      }

      p.status = approve && roster && entry ? "APPROVED" : "REJECTED";
      p.reviewedBy = reviewerId;
      p.reviewedAt = decidedAt;
      await p.save();

      await logAudit(
        session,
        p.status === "APPROVED" ? "roster.approve" : "roster.reject",
        `${p.month} day ${p.day} — ${nameOf.get(String(p.employee)) ?? String(p.employee)}`,
        `${p.oldCode || "—"} → ${p.newCode}`
      );
    }

    // Any other pending proposals for the same cells are superseded by the approved ones.
    if (appliedCells.length > 0) {
      await RosterChangeModel().updateMany(
        {
          status: "PENDING",
          _id: { $nin: docs.map((d) => d._id) },
          $or: appliedCells,
        },
        { $set: { status: "REJECTED", reviewedBy: reviewerId, reviewedAt: decidedAt } }
      );
    }

    revalidatePath("/admin/approvals");
    revalidatePath("/admin/roster");
    revalidatePath("/my-schedule");
    revalidatePath("/admin");

    if (!approve) {
      return { success: `${docs.length} proposal(s) rejected` };
    }
    return {
      success: `${applied} change(s) applied${skipped > 0 ? `, ${skipped} skipped (employee no longer in roster)` : ""}`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to review proposals" };
  }
}
