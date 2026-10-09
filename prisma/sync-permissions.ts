import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  getMissingAdminPermissions,
  grantAllPermissionsToAdminEmployees,
  syncRolePermissions,
  upsertPermissions,
  upsertRoles,
} from "./permission-sync";

// Gleicht nur Berechtigungen ab – keine Passwörter, Mitarbeiterdaten oder Beispieldaten.
// Nutzung: npx tsx prisma/sync-permissions.ts [--dry-run]
const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

function printReport(title: string, report: Awaited<ReturnType<typeof getMissingAdminPermissions>>) {
  console.log(`\n${title}`);
  if (report.length === 0) console.log("  Keine Benutzer mit Rolle ADMIN gefunden.");
  for (const entry of report) {
    const missing = entry.missing.length ? entry.missing.join(", ") : "keine – alle Rechte vorhanden";
    console.log(`  ${entry.login} (${entry.employeeId ?? "ohne Mitarbeiter"}): fehlend: ${missing}`);
  }
}

async function main() {
  printReport("Vorher – fehlende Rechte je Admin:", await getMissingAdminPermissions(prisma));
  if (dryRun) {
    console.log("\n--dry-run: keine Änderungen geschrieben.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const roles = await upsertRoles(tx);
    const permissions = await upsertPermissions(tx);
    await syncRolePermissions(tx, roles, permissions, { onlyAdminUpdates: true });
    await grantAllPermissionsToAdminEmployees(tx, permissions);
  }, { timeout: 120_000 });

  printReport("Nachher – fehlende Rechte je Admin:", await getMissingAdminPermissions(prisma));
  console.log("\nFertig. Admins müssen sich einmal ab- und wieder anmelden (Rechte stehen im Session-Token).");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
