import { requireRoles } from "@/lib/auth";
import { CsvPanel } from "@/components/csv-panel";

export default async function CsvPage() {
  await requireRoles("ADMIN", "MANAGER");
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CSV Import / Export</h1>
        <p className="text-sm text-muted-foreground">
          Bulk-create rosters from CSV or download the current one. Importing replaces the whole month.
        </p>
      </div>
      <CsvPanel />
    </div>
  );
}
