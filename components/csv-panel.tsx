"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Upload, Download, FileDown, Loader2, AlertCircle, FileUp } from "lucide-react";
import { importRosterCsv } from "@/app/actions/csv";
import { monthKey } from "@/lib/shifts";

export function CsvPanel() {
  const router = useRouter();
  const [month, setMonth] = useState(monthKey());
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const res = await importRosterCsv({}, formData);
      if (res?.error) {
        setError(res.error);
        toast.error(res.error);
      } else if (res?.success) {
        toast.success(res.success);
        setFileName("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileUp className="h-4 w-4 text-primary" /> Import roster
          </CardTitle>
          <CardDescription>
            CSV columns: <code className="rounded bg-muted px-1">employeeCode</code>,{" "}
            <code className="rounded bg-muted px-1">fullName</code>, optional{" "}
            <code className="rounded bg-muted px-1">team</code>, then{" "}
            <code className="rounded bg-muted px-1">Day1..Day31</code> shift codes.
            Unknown employees are created with password <code className="rounded bg-muted px-1">demo123</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={(formData) => submit(formData)}
            className="space-y-4"
          >
            <input type="hidden" name="month" value={month} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="imp-month">Month</Label>
                <Input
                  id="imp-month"
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value || monthKey())}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imp-file">CSV file</Label>
                <Input
                  id="imp-file"
                  type="file"
                  accept=".csv,text/csv"
                  required
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
                />
                {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
              </div>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import &amp; replace month
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileDown className="h-4 w-4 text-primary" /> Download
          </CardTitle>
          <CardDescription>Export the roster, or grab a template to fill in.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" render={<a href={`/api/csv/export?month=${month}`} />}>
            <Download className="h-4 w-4" /> Export {month}
          </Button>
          <Button variant="outline" render={<a href="/api/csv/template" />}>
            <Download className="h-4 w-4" /> Template
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
