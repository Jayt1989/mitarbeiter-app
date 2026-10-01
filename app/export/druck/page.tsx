import type { Metadata } from "next";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/authorization";
import { recordAuditLog } from "@/lib/audit";
import { buildExport, ExportError, type ExportResult } from "@/lib/export/build";
import { formatCreatedAt } from "@/lib/export/model";
import PrintControls from "./print-controls";
import PrintView from "./print-view";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toParams(values: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") params.set(key, value);
  }
  return params;
}

const loadExport = cache(async (query: string): Promise<{ result: ExportResult } | { error: string } | null> => {
  const context = await getAuthorizationContext();
  if (!context) return null;
  try {
    return { result: await buildExport(context, new URLSearchParams(query)) };
  } catch (error) {
    if (error instanceof ExportError) return { error: error.message };
    console.error("PDF-Export fehlgeschlagen", error);
    return { error: "Der PDF-Export konnte nicht erstellt werden." };
  }
});

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const loaded = await loadExport(toParams(await searchParams).toString());
  // Der Seitentitel wird vom Browser als Dateiname beim Speichern als PDF vorgeschlagen.
  return { title: loaded && "result" in loaded ? loaded.result.fileBase : "Export" };
}

export default async function PrintPage({ searchParams }: { searchParams: SearchParams }) {
  const params = toParams(await searchParams);
  const loaded = await loadExport(params.toString());
  if (!loaded) redirect("/login");

  if ("error" in loaded) {
    return (
      <main className="min-h-screen bg-[#f4f6f2] p-6 text-[#1c2b23]">
        <p role="alert" className="mx-auto max-w-xl rounded-lg border border-[#efb8ad] bg-[#fff0ec] px-4 py-3 text-sm font-semibold text-[#a33e31]">
          {loaded.error}
        </p>
      </main>
    );
  }

  const context = await getAuthorizationContext();
  await recordAuditLog({
    actorUserId: context?.userId ?? null,
    action: "export.pdf",
    entityType: "Export",
    newValues: { type: loaded.result.type, fileName: `${loaded.result.fileBase}.pdf`, parameters: Object.fromEntries(params) },
  });

  return (
    <main className="min-h-screen bg-white p-4 text-[#1c2b23] print:min-h-0 print:p-0">
      <PrintControls autoPrint={params.get("print") === "1"} />
      <PrintView result={loaded.result} createdAt={formatCreatedAt()} />
    </main>
  );
}
