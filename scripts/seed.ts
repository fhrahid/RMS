/* Seeds demo data: 3 teams, 15 users, 3 years (36 months) of rosters, shift
   requests, roster proposals and audit-trail activity with a realistic
   month-by-month growth trend.
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
const WORK_CODES = ["M2", "M3", "M4", "D1", "D2"];
const ROTATIONS = [
  ["M2", "M3", "M4", "D1", "D2", "DO"],
  ["D1", "D2", "DO", "M2", "M3", "M4"],
  ["M4", "DO", "M2", "M3", "D1", "D2"],
  ["M3", "M2", "DO", "D2", "D1", "M4"],
];
const LEAVE_CODES = ["SL", "CL", "EL", "HL"];
const REASONS = [
  "Family appointment in the morning",
  "Medical checkup",
  "Personal errand",
  "Childcare emergency",
  "University exam",
  "Travel plans",
  "Family event out of town",
  "Training session",
  "Trading shifts with teammate",
  "Feeling unwell",
];

let seedNum = 20260925;
function rnd() {
  seedNum = (seedNum * 1664525 + 1013904223) % 4294967296;
  return seedNum / 4294967296;
}
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const pick = <T,>(arr: T[]): T => arr[int(0, arr.length - 1)];

const PEOPLE: [string, string, string][] = [
  ["Ayesha Rahman", "SLL-10001", "Alpha"], ["Tanvir Hasan", "SLL-10002", "Alpha"],
  ["Nusrat Jahan", "SLL-10003", "Alpha"], ["Sadia Afrin", "SLL-10004", "Alpha"],
  ["Mehedi Hasan", "SLL-20001", "Beta"], ["Farhana Akter", "SLL-20002", "Beta"],
  ["Shakib Rahman", "SLL-20003", "Beta"], ["Tasnim Chowdhury", "SLL-20004", "Beta"],
  ["Imran Kabir", "SLL-30001", "Gamma"], ["Sumaiya Siddique", "SLL-30002", "Gamma"],
  ["Rakib Hossain", "SLL-30003", "Gamma"], ["Zahid Hasan", "SLL-30004", "Gamma"],
];

/** Current month + the 35 before it → 36 months ≈ 3 years of history. */
const MONTHS_BACK = 35;
const now = new Date();
const today = now.getDate();
const MONTHS: string[] = [];
for (let i = MONTHS_BACK; i >= 0; i--) {
  const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
  MONTHS.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
}
const CURRENT = MONTHS[MONTHS.length - 1];

const dimOf = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};
/** Date inside `month` on `day` at `h`:mm — clamped to today for the current month. */
const at = (month: string, day: number, h: number) => {
  const [y, m] = month.split("-").map(Number);
  const maxDay = month === CURRENT ? today : dimOf(month);
  return new Date(y, m - 1, Math.min(day, maxDay), h, int(0, 59));
};
const plusDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, lowercase: true },
  passwordHash: String,
  fullName: String,
  role: { type: String, enum: ROLES },
  employeeCode: { type: String, unique: true, sparse: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
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
const ChangeSchema = new mongoose.Schema({
  month: String, employee: mongoose.Schema.Types.ObjectId, day: Number,
  oldCode: String, newCode: String, proposedBy: mongoose.Schema.Types.ObjectId,
  status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
  reviewedBy: mongoose.Schema.Types.ObjectId, reviewedAt: Date,
}, { timestamps: true });
const AuditSchema = new mongoose.Schema({
  actor: mongoose.Schema.Types.ObjectId, actorName: String,
  action: String, target: String, details: String,
}, { timestamps: true });

interface LogEntry {
  actor: any; actorName: string; action: string;
  target: string; details: string; createdAt: Date; updatedAt: Date;
}

async function main() {
  await mongoose.connect(MONGODB_URI!, { dbName: process.env.MONGODB_DB || "roster" });
  console.log("Connected to MongoDB");

  const User = mongoose.model("User", UserSchema);
  const Team = mongoose.model("Team", TeamSchema);
  const Roster = mongoose.model("RosterMonth", RosterSchema);
  const Request = mongoose.model("ShiftRequest", RequestSchema);
  const Change = mongoose.model("RosterChange", ChangeSchema);
  const Audit = mongoose.model("AuditLog", AuditSchema);

  await Promise.all(
    ["users", "teams", "rostermonths", "shiftrequests", "rosterchanges", "auditlogs"].map((c) =>
      mongoose.connection.collection(c).deleteMany({})
    )
  );
  console.log("Cleared collections");

  const password = await bcrypt.hash("demo123", 10);
  const admin = await User.create({ username: "admin", passwordHash: password, fullName: "Administrator", role: "ADMIN" });
  const manager = await User.create({ username: "manager", passwordHash: password, fullName: "Demo Manager", role: "MANAGER" });
  const bosses = [admin, manager];
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
  const leaders: any[] = [];
  for (const [teamName, leader] of Object.entries(firstLeaderOfTeam)) {
    leader.role = "TEAM_LEADER";
    await leader.save();
    await Team.updateOne({ _id: teamDocs[teamName]._id }, { leader: leader._id });
    leaders.push(leader);
  }
  console.log(`Created ${employeeDocs.length} employees across 3 teams (leaders promoted)`);

  const allUsers = [admin, manager, ...employeeDocs.map((e) => e.doc)];
  const teamLeaderOf = new Map<string, any>(); // teamName -> leader doc
  for (const l of leaders) {
    const t = employeeDocs.find((e) => String(e.doc._id) === String(l._id));
    if (t) teamLeaderOf.set(t.teamName, l);
  }

  const logs: LogEntry[] = [];
  const addLog = (
    actor: any, action: string, target: string, details = "", when?: Date
  ) => {
    const ts = when ?? new Date();
    logs.push({
      actor: actor._id, actorName: actor.fullName, action, target, details,
      createdAt: ts, updatedAt: ts,
    });
  };

  const nameTag = (u: any) => `${u.fullName} (${u.employeeCode ?? u.username})`;

  // ---- Founding events in the oldest month -------------------------------
  const first = MONTHS[0];
  addLog(admin, "user.create", "manager", "MANAGER — Demo Manager", at(first, 1, 9));
  for (const name of ["Alpha", "Beta", "Gamma"]) {
    addLog(admin, "team.create", name, "", at(first, 1, 10 + int(0, 3)));
  }
  for (const [teamName, leader] of Object.entries(firstLeaderOfTeam)) {
    addLog(admin, "team.setLeader", teamName, leader.fullName, at(first, 1, 14 + int(0, 3)));
  }
  for (const { doc } of employeeDocs) {
    addLog(admin, "user.create", doc.username, `${doc.role} — ${doc.fullName}`, at(first, int(1, 3), int(9, 17)));
  }

  // ---- Per-month history --------------------------------------------------
  const pendingRequests = { count: 0 };
  const pendingProposals = { count: 0 };

  for (let idx = 0; idx < MONTHS.length; idx++) {
    const month = MONTHS[idx];
    const dim = dimOf(month);
    const isCurrent = month === CURRENT;
    // Activity grows over time (adoption trend) with random monthly variance.
    const busy = (0.55 + (idx / (MONTHS.length - 1)) * 1.15) * (0.75 + rnd() * 0.5);

    // Roster shifts per employee (rotations + occasional leave).
    const shiftsByUser = new Map<any, string[]>();
    const entries = employeeDocs.map(({ doc }, eidx) => {
      const rot = ROTATIONS[eidx % ROTATIONS.length];
      const shifts = Array.from({ length: dim }, (_, i) => {
        let code = rot[(i + eidx * 2) % rot.length];
        const r = rnd();
        if (code !== "DO") {
          if (r < 0.015) code = "SL";
          else if (r < 0.025) code = "CL";
          else if (r < 0.03) code = pick(LEAVE_CODES.slice(2));
        }
        return code;
      });
      shiftsByUser.set(doc, shifts);
      return { employee: doc._id, shifts };
    });

    // Roster built/imported in the first days of the month by admin or manager.
    const creator = rnd() < 0.6 ? admin : manager;
    const importMonth = idx > 0 && rnd() < 0.25;
    addLog(
      creator,
      importMonth ? "roster.import" : "roster.createMonth",
      month,
      importMonth ? `${entries.length} employees (0 created)` : `${entries.length} employees scaffolded`,
      at(month, int(1, 2), int(8, 11))
    );

    // Direct shift edits by admin/manager.
    const edits = Math.round(rnd() * 3 * busy);
    for (let i = 0; i < edits; i++) {
      const { doc } = pick(employeeDocs);
      const shifts = shiftsByUser.get(doc)!;
      const day = int(1, dim);
      const old = shifts[day - 1];
      let code = pick(WORK_CODES);
      if (code === old) code = pick(WORK_CODES.filter((c) => c !== old));
      shifts[day - 1] = code;
      addLog(
        pick(bosses), "roster.setShift", nameTag(doc),
        `${month} day ${day}: ${old || "—"} → ${code}`,
        at(month, day, int(9, 18))
      );
    }

    // Roster change proposals from team leaders.
    const nProps = Math.min(9, 1 + Math.round(rnd() * 5 * busy));
    for (let i = 0; i < nProps; i++) {
      const emp = pick(employeeDocs);
      const shifts = shiftsByUser.get(emp.doc)!;
      const maxDay = isCurrent ? today : dim;
      const day = int(1, maxDay);
      const oldCode = shifts[day - 1];
      let newCode = pick(WORK_CODES);
      if (newCode === oldCode) newCode = pick(WORK_CODES.filter((c) => c !== oldCode));

      const proposedAt = at(month, day, int(9, 18));
      const leader = teamLeaderOf.get(emp.teamName) ?? pick(leaders);
      let status: "PENDING" | "APPROVED" | "REJECTED" = "PENDING";
      let reviewedBy: any = null;
      let reviewedAt: Date | null = null;
      if (!isCurrent) {
        status = rnd() < 0.7 ? "APPROVED" : "REJECTED";
        reviewedBy = pick(bosses);
        reviewedAt = plusDays(proposedAt, int(1, 3));
        if (status === "APPROVED") shifts[day - 1] = newCode;
      } else if (rnd() < 0.4) {
        status = rnd() < 0.7 ? "APPROVED" : "REJECTED";
        reviewedBy = pick(bosses);
        reviewedAt = plusDays(proposedAt, 1);
        if (reviewedAt > now) { status = "PENDING"; reviewedBy = null; reviewedAt = null; }
        else if (status === "APPROVED") shifts[day - 1] = newCode;
      } else {
        pendingProposals.count++;
      }

      await Change.create({
        month, employee: emp.doc._id, day, oldCode, newCode,
        proposedBy: leader._id, status, reviewedBy: reviewedBy?._id ?? null, reviewedAt,
      });
      addLog(leader, "roster.propose", `${month} day ${day} — ${nameTag(emp.doc)}`, `${oldCode || "—"} → ${newCode}`, proposedAt);
      if (status !== "PENDING") {
        addLog(reviewedBy, status === "APPROVED" ? "roster.approve" : "roster.reject",
          `${month} day ${day} — ${nameTag(emp.doc)}`, `${oldCode || "—"} → ${newCode}`, reviewedAt!);
      }
    }

    await Roster.create({ month, daysInMonth: dim, entries });

    // Shift change / swap requests from employees.
    const nReqs = Math.min(7, 1 + Math.round(rnd() * 4 * busy));
    for (let i = 0; i < nReqs; i++) {
      const requester = pick(employeeDocs);
      const type = rnd() < 0.6 ? "CHANGE" : "SWAP";
      const date = int(1, isCurrent ? today : dim);
      const shifts = shiftsByUser.get(requester.doc)!;
      const currentShift = shifts[date - 1] ?? "M2";
      const reason = pick(REASONS);
      const requestedShift = pick(WORK_CODES.filter((c) => c !== currentShift));

      let target: any = null;
      let targetShift = "";
      if (type === "SWAP") {
        const mates = employeeDocs.filter((e) => e.teamName === requester.teamName && e.doc !== requester.doc);
        target = (mates.length ? pick(mates) : pick(employeeDocs)).doc;
        targetShift = shiftsByUser.get(target)![date - 1] ?? "D1";
      }

      const submittedAt = at(month, date, int(8, 19));
      let status: "PENDING" | "APPROVED" | "REJECTED" = "PENDING";
      let reviewedBy: any = null;
      let reviewedAt: Date | null = null;
      if (!isCurrent) {
        status = rnd() < 0.6 ? "APPROVED" : "REJECTED";
        reviewedBy = pick(bosses);
        reviewedAt = plusDays(submittedAt, int(1, 4));
      } else if (pendingRequests.count >= 2 || rnd() < 0.5) {
        status = rnd() < 0.6 ? "APPROVED" : "REJECTED";
        reviewedBy = pick(bosses);
        reviewedAt = plusDays(submittedAt, 1);
        if (reviewedAt > now) { status = "PENDING"; reviewedBy = null; reviewedAt = null; }
      } else {
        pendingRequests.count++;
      }

      await Request.create({
        type, requester: requester.doc._id, date, month,
        currentShift, requestedShift,
        target: target?._id ?? null, targetShift,
        reason, status, reviewedBy: reviewedBy?._id ?? null, reviewedAt,
      });
      addLog(
        requester.doc,
        type === "CHANGE" ? "request.change" : "request.swap",
        `${month} day ${date}`,
        type === "CHANGE"
          ? `${currentShift || "—"} → ${requestedShift} — ${reason}`
          : `with ${target.fullName} — ${reason}`,
        submittedAt
      );
      if (status !== "PENDING") {
        addLog(reviewedBy, status === "APPROVED" ? "request.approve" : "request.reject",
          `${type} — ${month} day ${date}`, `requester=${requester.doc.fullName}`, reviewedAt!);
      }
    }

    // Sign-ins throughout the month (quiet on weekends).
    for (const u of allUsers) {
      const base = u.role === "ADMIN" ? int(3, 8) : u.role === "MANAGER" ? int(2, 7) : u.role === "TEAM_LEADER" ? int(1, 5) : int(0, 3);
      const k = Math.round(base * Math.min(1.4, busy));
      for (let i = 0; i < k; i++) {
        const day = int(1, isCurrent ? today : dim);
        const wd = at(month, day, 10).getDay();
        if ((wd === 0 || wd === 6) && rnd() < 0.6) continue;
        addLog(u, "auth.login", u.username, "Signed in", at(month, day, int(7, 20)));
      }
    }

    console.log(`  ${month}: roster + ${nProps} proposal(s), ${nReqs} request(s), ${edits} edit(s)`);
  }

  addLog(admin, "system.seed", CURRENT, "Demo data seeded (3 years)");

  // Insert audit logs in chunks.
  for (let i = 0; i < logs.length; i += 500) {
    await Audit.insertMany(logs.slice(i, i + 500));
  }
  console.log(`Inserted ${logs.length} audit events across ${MONTHS.length} months`);

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
