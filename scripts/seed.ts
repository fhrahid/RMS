/* Seeds demo data: 3 teams, 15 users, September 2026 roster, sample requests.
   Run: npm run seed  (requires MONGODB_URI in .env.local) */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI missing in .env.local");
  process.exit(1);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const ROLES = ["ADMIN", "MANAGER", "TEAM_LEADER", "EMPLOYEE"];
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
const ALL_CODES = ["M2", "M3", "M4", "D1", "D2", "DO", "SL", "CL", "EL", "HL"];
const ROTATIONS = [
  ["M2", "M3", "M4", "D1", "D2", "DO"],
  ["D1", "D2", "DO", "M2", "M3", "M4"],
  ["M4", "DO", "M2", "M3", "D1", "D2"],
  ["M3", "M2", "DO", "D2", "D1", "M4"],
];

let seedNum = 20260917;
function rnd() {
  seedNum = (seedNum * 1664525 + 1013904223) % 4294967296;
  return seedNum / 4294967296;
}

const PEOPLE: [string, string, string][] = [
  ["Ayesha Rahman", "SLL-10001", "Alpha"], ["Tanvir Hasan", "SLL-10002", "Alpha"],
  ["Nusrat Jahan", "SLL-10003", "Alpha"], ["Sadia Afrin", "SLL-10004", "Alpha"],
  ["Mehedi Hasan", "SLL-20001", "Beta"], ["Farhana Akter", "SLL-20002", "Beta"],
  ["Shakib Rahman", "SLL-20003", "Beta"], ["Tasnim Chowdhury", "SLL-20004", "Beta"],
  ["Imran Kabir", "SLL-30001", "Gamma"], ["Sumaiya Siddique", "SLL-30002", "Gamma"],
  ["Rakib Hossain", "SLL-30003", "Gamma"], ["Zahid Hasan", "SLL-30004", "Gamma"],
];

const MONTH = "2026-09";
const DIM = 30;

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, lowercase: true },
  passwordHash: String,
  fullName: String,
  role: { type: String, enum: ROLES },
  employeeCode: { type: String, unique: true, sparse: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", default: null },
  active: { type: Boolean, default: true },
}, { timestamps: true });
const TeamSchema = new mongoose.Schema({ name: { type: String, unique: true }, leader: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null } }, { timestamps: true });
const RosterSchema = new mongoose.Schema({ month: { type: String, unique: true }, daysInMonth: Number, entries: [{ employee: mongoose.Schema.Types.ObjectId, shifts: [String] }] }, { timestamps: true });
const RequestSchema = new mongoose.Schema({
  type: String, requester: mongoose.Schema.Types.ObjectId, date: Number, month: String,
  currentShift: String, requestedShift: String, target: mongoose.Schema.Types.ObjectId,
  targetShift: String, reason: String,
  status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
  reviewedBy: mongoose.Schema.Types.ObjectId, reviewedAt: Date,
}, { timestamps: true });
const AuditSchema = new mongoose.Schema({
  actor: mongoose.Schema.Types.ObjectId, actorName: String,
  action: String, target: String, details: String,
}, { timestamps: true });

async function main() {
  await mongoose.connect(MONGODB_URI!, { dbName: process.env.MONGODB_DB || "roster" });
  console.log("Connected to MongoDB");

  const User = mongoose.model("User", UserSchema);
  const Team = mongoose.model("Team", TeamSchema);
  const Roster = mongoose.model("RosterMonth", RosterSchema);
  const Request = mongoose.model("ShiftRequest", RequestSchema);
  const Audit = mongoose.model("AuditLog", AuditSchema);

  await Promise.all(
    ["users", "teams", "rostermonths", "shiftrequests", "auditlogs"].map((c) =>
      mongoose.connection.collection(c).deleteMany({})
    )
  );
  console.log("Cleared collections");

  const password = await bcrypt.hash("demo123", 10);
  const admin = await User.create({ username: "admin", passwordHash: password, fullName: "Administrator", role: "ADMIN" });
  await User.create({ username: "manager", passwordHash: password, fullName: "Demo Manager", role: "MANAGER" });
  console.log("Created admin + manager");

  const teamDocs: Record<string, any> = {};
  for (const name of ["Alpha", "Beta", "Gamma"]) {
    teamDocs[name] = await Team.create({ name, leader: null });
  }

  const employeeDocs: { doc: any; teamName: string }[] = [];
  const firstLeaderOfTeam: Record<string, any> = {};
  for (const [name, code, teamName] of PEOPLE) {
    const u = await User.create({
      username: code.toLowerCase(),
      passwordHash: password,
      fullName: name,
      role: "EMPLOYEE",
      employeeCode: code,
      team: teamDocs[teamName]._id,
    });
    employeeDocs.push({ doc: u, teamName });
    if (!firstLeaderOfTeam[teamName]) firstLeaderOfTeam[teamName] = u;
  }
  for (const [teamName, leader] of Object.entries(firstLeaderOfTeam)) {
    leader.role = "TEAM_LEADER";
    await leader.save();
    await Team.updateOne({ _id: teamDocs[teamName]._id }, { leader: leader._id });
  }
  console.log(`Created ${employeeDocs.length} employees across 3 teams (leaders promoted)`);

  const entries = employeeDocs.map(({ doc }, idx) => {
    const rot = ROTATIONS[idx % ROTATIONS.length];
    const shifts = Array.from({ length: DIM }, (_, i) => {
      let code = rot[(i + idx * 2) % rot.length];
      const r = rnd();
      if (code !== "DO") {
        if (r < 0.015) code = "SL";
        else if (r < 0.025) code = "CL";
        else if (r < 0.03) code = "HL";
      }
      return code;
    });
    return { employee: doc._id, shifts };
  });
  await Roster.create({ month: MONTH, daysInMonth: DIM, entries });
  console.log(`Roster ${MONTH} built (${entries.length} employees × ${DIM} days)`);

  const [rq, tg] = employeeDocs;
  await Request.create({
    type: "CHANGE", requester: rq.doc._id, month: MONTH, date: 10,
    currentShift: entries[0].shifts[9] || "M2", requestedShift: "D1",
    reason: "Family appointment in the morning", status: "PENDING",
  });
  await Request.create({
    type: "SWAP", requester: tg.doc._id, target: employeeDocs[1].doc._id,
    month: MONTH, date: 12,
    currentShift: entries[9].shifts[11] || "M2", targetShift: entries[1].shifts[11] || "D1",
    reason: "Trading shifts with teammate for a personal errand", status: "PENDING",
  });
  console.log("2 sample requests created");

  await Audit.create({
    actor: admin._id, actorName: "Administrator",
    action: "system.seed", target: MONTH,
    details: "Demo data seeded",
  });

  await mongoose.disconnect();
  console.log("\nSeed complete! Logins (password for ALL: demo123):");
  console.log("  admin / demo123          (Admin)");
  console.log("  manager / demo123        (Manager)");
  console.log("  sll-10001 / demo123      (Team Leader — Ayesha Rahman)");
  console.log("  sll-20001 / demo123      (Employee — Mehedi Hasan)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
