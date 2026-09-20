"use server";

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserModel, TeamModel } from "@/models";
import { assertRoles, logAudit } from "./auth";
import type { ActionState } from "./shared";

const createSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  username: z.string().min(3, "Username must be at least 3 characters").regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, . _ - only"),
  password: z.string().min(4, "Password must be at least 4 characters"),
  role: z.enum(["ADMIN", "MANAGER", "TEAM_LEADER", "EMPLOYEE"]),
  employeeCode: z.string().regex(/^SLL-\d+$/i, "Employee code must look like SLL-12345").optional().or(z.literal("")),
  teamId: z.string().optional().or(z.literal("")),
});

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await assertRoles(["ADMIN"]);
    const raw = Object.fromEntries(formData.entries());
    const data = createSchema.parse(raw);

    const code = data.employeeCode ? data.employeeCode.toUpperCase() : "";
    if ((data.role === "EMPLOYEE" || data.role === "TEAM_LEADER") && !code) {
      return { error: "Employee code (SLL-XXXXX) is required for this role" };
    }
    if (code) {
      const dupe = await UserModel().findOne({ employeeCode: code });
      if (dupe) return { error: `Employee code ${code} is already taken` };
    }

    const teamId = data.teamId && data.teamId !== "(none)" ? data.teamId : null;
    if (teamId) {
      const team = await TeamModel().findById(teamId);
      if (!team) return { error: "Selected team does not exist" };
    }

    const user = await UserModel().create({
      username: data.username.toLowerCase(),
      passwordHash: await bcrypt.hash(data.password, 10),
      fullName: data.fullName,
      role: data.role,
      employeeCode: code || undefined,
      team: teamId ? new mongoose.Types.ObjectId(teamId) : null,
      active: true,
    });

    await logAudit(admin, "user.create", user.username, `${data.role} — ${data.fullName}`);
    revalidatePath("/admin/users");
    revalidatePath("/admin");
    return { success: `User ${user.username} created` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create user" };
  }
}

const updateSchema = z.object({
  userId: z.string().min(1),
  fullName: z.string().min(2),
  role: z.enum(["ADMIN", "MANAGER", "TEAM_LEADER", "EMPLOYEE"]),
  employeeCode: z.string().optional().or(z.literal("")),
  teamId: z.string().optional().or(z.literal("")),
  active: z.string().optional(),
});

export async function updateUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await assertRoles(["ADMIN"]);
    const data = updateSchema.parse(Object.fromEntries(formData.entries()));
    const user = await UserModel().findById(data.userId);
    if (!user) return { error: "User not found" };
    const nextTeam = data.role === "EMPLOYEE" || data.role === "TEAM_LEADER"
      ? (data.teamId && data.teamId !== "(none)" ? data.teamId : null)
      : null;

    user.fullName = data.fullName;
    user.role = data.role;
    if (data.employeeCode !== undefined) {
      const code = data.employeeCode.trim().toUpperCase();
      if (code) {
        if (code !== user.employeeCode) {
          const dupe = await UserModel().findOne({ employeeCode: code, _id: { $ne: user._id } });
          if (dupe) return { error: `Employee code ${code} is already taken` };
        }
        user.employeeCode = code;
      } else if (data.role === "ADMIN" || data.role === "MANAGER") {
        user.employeeCode = undefined;
      } else {
        return { error: "Employee code (SLL-XXXXX) is required for this role" };
      }
    }
    user.team = nextTeam ? new mongoose.Types.ObjectId(nextTeam) : null;
    user.active = formData.get("active") === "on";
    await user.save();

    await logAudit(admin, "user.update", user.username, `role=${data.role} active=${user.active}`);
    revalidatePath("/admin/users");
    revalidatePath("/admin");
    return { success: `User ${user.username} updated` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update user" };
  }
}

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await assertRoles(["ADMIN"]);
    const userId = String(formData.get("userId") ?? "");
    const password = String(formData.get("password") ?? "");
    if (password.length < 4) return { error: "Password must be at least 4 characters" };
    const user = await UserModel().findById(userId);
    if (!user) return { error: "User not found" };
    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();
    await logAudit(admin, "user.resetPassword", user.username);
    revalidatePath("/admin/users");
    return { success: `Password reset for ${user.username}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to reset password" };
  }
}
