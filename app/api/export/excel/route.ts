import { NextResponse } from "next/server";
import { getAuthorizationContext } from "@/lib/authorization";
import { recordAuditLog } from "@/lib/audit";
import { buildExport, ExportError } from "@/lib/export/build";
import { createWorkbook } from "@/lib/export/excel";

export async function GET(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  try {
    const result = await buildExport(context, params);
    const buffer = await createWorkbook(result);
    const fileName = `${result.fileBase}.xlsx`;

    await recordAuditLog({
      actorUserId: context.userId,
      action: "export.excel",
      entityType: "Export",
      newValues: { type: result.type, fileName, parameters: Object.fromEntries(params) },
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ExportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Excel-Export fehlgeschlagen", error);
    return NextResponse.json({ error: "Der Excel-Export konnte nicht erstellt werden." }, { status: 500 });
  }
}
