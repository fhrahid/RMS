"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserModel, TeamModel } from "@/models";
import { assertRoles, logAudit } from "./auth";
import type { ActionState } from "./shared";

const createSchema = z.object({ name: z.string().min(2, "Team name is required") });

export async function createTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await assertRoles(["ADMIN"]);
    const { name } = createSchema.parse({ name: formData.get("name") });
    const dupe = await TeamModel().findOne({ name: name.trim() });
    if (dupe) return { error: "A team with this name already exists" };
    const team = await TeamModel().create({ name: name.trim(), leader: null });
    await logAudit(admin, "team.create", team.name);
    revalidatePath("/admin/teams");
    revalidatePath("/admin/users");
    return { success: `Team “${team.name}” created` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create team" };
  }
}

export async function renameTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await assertRoles(["ADMIN"]);
    const teamId = String(formData.get("teamId") ?? "");
    const { name } = createSchema.parse({ name: formData.get("name") });
    const team = await TeamModel().findById(teamId);
    if (!team) return { error: "Team not found" };
    const old = team.name;
    team.name = name.trim();
    await team.save();
    await logAudit(admin, "team.rename", team.name, `was “${old}”`);
    revalidatePath("/admin/teams");
    return { success: "Team renamed" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to rename team" };
  }
}

export async function deleteTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await assertRoles(["ADMIN"]);
    const teamId = String(formData.get("teamId") ?? "");
    const team = await TeamModel().findById(teamId);
    if (!team) return { error: "Team not found" };
    await UserModel().updateMany({ team: teamId }, { $set: { team: null } });
    await team.deleteOne();
    await logAudit(admin, "team.delete", team.name);
    revalidatePath("/admin/teams");
    revalidatePath("/admin/users");
    return { success: `Team “${team.name}” deleted (members unassigned)` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete team" };
  }
}

export async function setTeamLeader(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await assertRoles(["ADMIN"]);
    const teamId = String(formData.get("teamId") ?? "");
    const userIdRaw = String(formData.get("userId") ?? "");
    const team = await TeamModel().findById(teamId);
    if (!team) return { error: "Team not found" };
    const leader = userIdRaw && userIdRaw !== "(none)" ? await UserModel().findById(userIdRaw) : null;
    team.leader = leader ? leader._id : null;
    await team.save();
    if (leader && leader.role === "EMPLOYEE") {
      leader.role = "TEAM_LEADER";
      await leader.save();
    }
    await logAudit(admin, "team.setLeader", team.name, leader ? leader.fullName : "cleared");
    revalidatePath("/admin/teams");
    revalidatePath("/admin/users");
    return { success: leader ? `${leader.fullName} is now leader of ${team.name}` : "Leader cleared" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to set leader" };
  }
}

export async function addTeamMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await assertRoles(["ADMIN"]);
    const teamId = String(formData.get("teamId") ?? "");
    const userId = String(formData.get("userId") ?? "");
    const team = await TeamModel().findById(teamId);
    const user = await UserModel().findById(userId);
    if (!team || !user) return { error: "Team or user not found" };
    user.team = team._id;
    await user.save();
    await logAudit(admin, "team.addMember", team.name, user.fullName);
    revalidatePath("/admin/teams");
    revalidatePath("/admin/users");
    return { success: `${user.fullName} added to ${team.name}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add member" };
  }
}

export async function removeTeamMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await assertRoles(["ADMIN"]);
    const userId = String(formData.get("userId") ?? "");
    const user = await UserModel().findById(userId);
    if (!user) return { error: "User not found" };
    user.team = null;
    await user.save();
    await logAudit(admin, "team.removeMember", user.fullName);
    revalidatePath("/admin/teams");
    revalidatePath("/admin/users");
    return { success: `${user.fullName} removed from team` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to remove member" };
  }
}
