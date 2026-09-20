import { connectDB } from "@/lib/mongodb";
import { UserModel, TeamModel } from "@/models";
import { requireRoles } from "@/lib/auth";
import { TeamsPanel } from "@/components/teams-panel";

export default async function TeamsPage() {
  await requireRoles("ADMIN");
  await connectDB();

  const teams = await TeamModel().find().sort({ name: 1 });
  const members = await UserModel()
    .find({ role: { $in: ["EMPLOYEE", "TEAM_LEADER"] }, active: true })
    .sort({ fullName: 1 });

  const teamRows = teams.map((t) => ({
    _id: String(t._id),
    name: t.name,
    leaderId: t.leader ? String(t.leader) : null,
    memberIds: members.filter((m) => String(m.team) === String(t._id)).map((m) => String(m._id)),
  }));

  const memberRows = members.map((m) => ({
    _id: String(m._id),
    fullName: m.fullName,
    employeeCode: m.employeeCode ?? "",
    role: m.role,
    teamId: m.team ? String(m.team) : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
        <p className="text-sm text-muted-foreground">
          Create teams, assign leaders and members. Leaders are promoted to TEAM_LEADER.
        </p>
      </div>
      <TeamsPanel teams={teamRows} members={memberRows} />
    </div>
  );
}
