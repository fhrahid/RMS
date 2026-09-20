import { NextResponse } from "next/server";

export async function GET() {
  const header = ["employeeCode", "fullName", "team", ...Array.from({ length: 31 }, (_, i) => `Day${i + 1}`)];
  const sample = ["SLL-10001", "Ayesha Rahman", "Alpha", ...Array.from({ length: 31 }, (_, i) => (i % 6 === 5 ? "DO" : "M2"))];
  const csv = [header.join(","), sample.join(",")].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="roster-template.csv"',
    },
  });
}
