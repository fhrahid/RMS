"use server";

import { revalidatePath } from "next/cache";
import mongoose from "mongoose";
import { z } from "zod";
import {
  UserModel,
  RosterMonthModel,
  ShiftRequestModel,
} from "@/models";
import { assertRoles, logAudit } from "./auth";
import { getSession } from "@/lib/auth";
import { ALL_CODES, daysInMonth } from "@/lib/shifts";
import type { ActionState } from "./shared";

const changeSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  date: z.coerce.number().int().min(1).max(31),
  requestedShift: z.enum(ALL_CODES, "Choose a valid shift"),
  reason: z.string().min(3, "Reason is required"),
});

const swapSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  date: z.coerce.number().int().min(1).max(31),
  targetId: z.string().min(1, "Choose a teammate"),
  reason: z.string().min(3, "Reason is required"),
});

async function entryFor(month: string, userId: string) {
  const roster = await RosterMonthModel().findOne({ month });
  if (!roster) return null;
  const entry = roster.entries.find((e) => String(e.employee) === userId);
  return { roster, entry };
}

export async function submitChangeRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await getSession();
    if (!session || (session.role !== "EMPLOYEE" && session.role !== "TEAM_LEADER")) {
      return { error: "Only employees and team leaders can submit requests" };
    }

    const { month, date, requestedShift, reason } = changeSchema.parse(Object.fromEntries(formData.entries()));
    if (date > daysInMonth(month)) return { error: "Invalid date" };

    const { roster, entry } = (await entryFor(month, session.userId)) ?? {};
    if (!roster || !entry) return { error: "No roster exists for this month yet" };
    const currentShift = entry.shifts[date - 1] ?? "";

    const dupe = await ShiftRequestModel().findOne({
      requester: session.userId, month, date, status: "PENDING",
    });
    if (dupe) return { error: "You already have a pending request for this date" };

    await ShiftRequestModel().create({
      type: "CHANGE",
      requester: session.userId,
      month,
      date,
      currentShift,
      requestedShift,
      reason,
      status: "PENDING",
    });

    await logAudit(session, "request.change", `${month} day ${date}`, `${currentShift || "—"} → ${requestedShift} — ${reason}`);
    revalidatePath("/my-schedule");
    revalidatePath("/admin/requests");
    revalidatePath("/admin");
    return { success: "Shift change request submitted" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to submit request" };
  }
}

export async function submitSwapRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await getSession();
    if (!session || (session.role !== "EMPLOYEE" && session.role !== "TEAM_LEADER")) {
      return { error: "Only employees and team leaders can submit requests" };
    }

    const { month, date, targetId, reason } = swapSchema.parse(Object.fromEntries(formData.entries()));
    if (date > daysInMonth(month)) return { error: "Invalid date" };
    if (targetId === session.userId) return { error: "You cannot swap with yourself" };

    const { roster, entry } = (await entryFor(month, session.userId)) ?? {};
    if (!roster || !entry) return { error: "No roster exists for this month yet" };
    const targetEntry = roster.entries.find((e) => String(e.employee) === targetId);
    if (!targetEntry) return { error: "Target employee is not in this roster" };

    const currentShift = entry.shifts[date - 1] ?? "";
    const targetShift = targetEntry.shifts[date - 1] ?? "";

    const dupe = await ShiftRequestModel().findOne({
      requester: session.userId, month, date, status: "PENDING",
    });
    if (dupe) return { error: "You already have a pending request for this date" };

    const target = await UserModel().findById(targetId);
    if (!target) return { error: "Target employee not found" };
    if (session.teamId && String(target.team ?? "") !== session.teamId) {
      return { error: "You can only swap with teammates from your own team" };
    }

    await ShiftRequestModel().create({
      type: "SWAP",
      requester: session.userId,
      month,
      date,
      currentShift,
      target: targetId,
      targetShift,
      reason,
      status: "PENDING",
    });

    await logAudit(session, "request.swap", `${month} day ${date}`, `with ${target.fullName} — ${reason}`);
    revalidatePath("/my-schedule");
    revalidatePath("/admin/requests");
    revalidatePath("/admin");
    return { success: `Swap request with ${target.fullName} submitted` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to submit request" };
  }
}

export async function reviewRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertRoles(["ADMIN", "MANAGER"]);
    const requestId = String(formData.get("requestId") ?? "");
    const approve = String(formData.get("decision") ?? "") === "approve";

    const req = await ShiftRequestModel().findById(requestId);
    if (!req) return { error: "Request not found" };
    if (req.status !== "PENDING") return { error: "Request was already reviewed" };

    const roster = await RosterMonthModel().findOne({ month: req.month });
    if (!roster) return { error: "Roster month missing" };

    const requesterEntry = roster.entries.find((e) => String(e.employee) === String(req.requester));

    if (approve) {
      if (req.type === "CHANGE") {
        if (!requesterEntry) return { error: "Requester not in roster" };
        while (requesterEntry.shifts.length < daysInMonth(req.month)) requesterEntry.shifts.push("");
        requesterEntry.shifts[req.date - 1] = req.requestedShift;
      } else {
        const targetEntry = roster.entries.find((e) => String(e.employee) === String(req.target));
        if (!requesterEntry || !targetEntry) return { error: "Swap participants not in roster" };
        while (requesterEntry.shifts.length < daysInMonth(req.month)) requesterEntry.shifts.push("");
        while (targetEntry.shifts.length < daysInMonth(req.month)) targetEntry.shifts.push("");
        const a = requesterEntry.shifts[req.date - 1] ?? "";
        const b = targetEntry.shifts[req.date - 1] ?? "";
        requesterEntry.shifts[req.date - 1] = b;
        targetEntry.shifts[req.date - 1] = a;
      }
      roster.markModified("entries");
      await roster.save();
      revalidatePath("/admin/roster");
      revalidatePath("/my-schedule");
    }

    req.status = approve ? "APPROVED" : "REJECTED";
    req.reviewedBy = new mongoose.Types.ObjectId(session.userId);
    req.reviewedAt = new Date();
    await req.save();

    await logAudit(
      session,
      approve ? "request.approve" : "request.reject",
      `${req.type} — ${req.month} day ${req.date}`,
      `requester=${req.requester}`
    );
    revalidatePath("/admin/requests");
    revalidatePath("/admin");
    revalidatePath("/my-schedule");
    return { success: approve ? "Request approved" : "Request rejected" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to review request" };
  }
}
