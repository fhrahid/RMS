"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserModel, TeamModel, RosterMonthModel } from "@/models";
import { assertRoles, logAudit } from "./auth";
import { daysInMonth } from "@/lib/shifts";
import type { ActionState } from "./shared";

const importSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM"),
  csv: z.string().min(1, "CSV content is required"),
});

/**
 * Expected CSV columns: employeeCode, fullName, Day1..Day31 (shift codes).
 * Employees missing from the roster get created as EMPLOYEE (password: demo123).
 */
export async function importRosterCsv(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await assertRoles(["ADMIN", "MANAGER"]);
    const { month, csv } = importSchema.parse({
      month: formData.get("month"),
      csv: formData.get("csv"),
    });

    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return { error: "CSV needs a header row and at least one data row" };

    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const codeIdx = header.indexOf("employeecode");
    const nameIdx = header.indexOf("fullname");
    if (codeIdx === -1 || nameIdx === -1) {
      return { error: "Header must include 'employeeCode' and 'fullName' columns" };
    }
    const dayIdx = header
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => /^day(\d{1,2})$/.test(h))
      .map(({ h, i }) => ({ day: Number(h.replace("day", "")), i }))
      .filter(({ day }) => day >= 1 && day <= 31);

    const dim = daysInMonth(month);
    let created = 0;
    let updated = 0;

    const teams = await TeamModel().find();
    const teamByName = new Map(teams.map((t) => [t.name.toLowerCase(), t._id]));
    const teamIdx = header.indexOf("team");

    const entries: { employee: import("mongoose").Types.ObjectId; shifts: string[] }[] = [];

    for (const line of lines.slice(1)) {
      const cols = line.split(",").map((c) => c.trim());
      const code = (cols[codeIdx] ?? "").toUpperCase();
      const name = cols[nameIdx] ?? "";
      if (!/^SLL-\d+$/.test(code) || !name) continue;

      let user = await UserModel().findOne({ employeeCode: code });
      if (!user) {
        user = await UserModel().create({
          username: code.toLowerCase(),
          passwordHash: await (await import("bcryptjs")).hash("demo123", 10),
          fullName: name,
          role: "EMPLOYEE",
          employeeCode: code,
          active: true,
        });
        created++;
      } else {
        updated++;
        if (user.role === "EMPLOYEE" && !user.active) {
          user.active = true;
          await user.save();
        }
      }

      const teamName = teamIdx >= 0 ? (cols[teamIdx] ?? "").toLowerCase() : "";
      if (teamName && teamByName.has(teamName) && !user.team) {
        user.team = teamByName.get(teamName)!;
        await user.save();
      }

      const shifts = Array.from({ length: dim }, (_, i) => {
        const d = i + 1;
        const col = dayIdx.find((x) => x.day === d);
        return col ? (cols[col.i] ?? "") : "";
      });
      entries.push({ employee: user._id, shifts });
    }

    if (entries.length === 0) return { error: "No valid rows found (need SLL-XXXXX code + full name)" };

    await RosterMonthModel().deleteMany({ month });
    await RosterMonthModel().create({ month, daysInMonth: dim, entries });

    await logAudit(session, "roster.import", month, `${entries.length} employees (${created} created)`);
    revalidatePath("/admin/roster");
    revalidatePath("/admin");
    revalidatePath("/my-schedule");
    return { success: `Imported ${entries.length} employees (${created} new, ${updated} existing)` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import failed" };
  }
}
