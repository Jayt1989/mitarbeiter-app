import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { sampleEmployees } from "../app/mitarbeiter/data";
import { analyzeEmployeeDeletion, isProtectedPersonnelNumber } from "../lib/employee-deletion";

// Nur lesend: listet alle Mitarbeiter/Benutzerkonten mit verknüpften Daten und einer Empfehlung.
// Nutzung: npm run db:employee-report   (bzw. DATABASE_URL="<neon-url>" npm run db:employee-report)
const prisma = new PrismaClient();
const seedIds = new Set(
  sampleEmployees.filter((employee) => !isProtectedPersonnelNumber(employee.personnelNumber)).map((employee) => employee.id),
);

function looksLikeTestUser(employee: { id: string; personnelNumber: string; firstName: string; lastName: string; email: string | null }) {
  if (isProtectedPersonnelNumber(employee.personnelNumber)) return false;
  const text = `${employee.firstName} ${employee.lastName} ${employee.email ?? ""}`.toLowerCase();
  return seedIds.has(employee.id) || /\btest|demo|beispiel|example\.(com|org)/.test(text);
}

async function main() {
  const employees = await prisma.employee.findMany({
    orderBy: { personnelNumber: "asc" },
    select: { id: true, firstName: true, lastName: true, email: true, personnelNumber: true, createdAt: true },
  });
  const orphanUsers = await prisma.user.findMany({
    where: { employeeId: null },
    select: { login: true, active: true, role: { select: { code: true } } },
  });

  console.log(`\n${employees.length} Mitarbeiter in der Datenbank\n`);
  for (const employee of employees) {
    const preview = (await analyzeEmployeeDeletion(prisma, employee.id, null))!;
    const hardBlockers = preview.blockers.filter((blocker) => blocker.code !== "active");
    const recommendation = isProtectedPersonnelNumber(employee.personnelNumber)
      ? "GESCHÜTZT – behalten"
      : hardBlockers.length
        ? "NUR DEAKTIVIEREN"
        : preview.historical.length
          ? "LÖSCHBAR nach Bestätigung (hat historische Daten)"
          : "LÖSCHBAR (keine historischen Daten)";
    const tags = [
      seedIds.has(employee.id) ? "Seed-Demo" : null,
      looksLikeTestUser(employee) ? "Test-Verdacht" : null,
    ].filter(Boolean).join(", ");

    console.log(
      `${employee.personnelNumber.padEnd(10)} ${preview.employee.name.padEnd(24)} ` +
        `${preview.employee.isActive ? "aktiv  " : "inaktiv"} ${(preview.employee.role ?? "kein Konto").padEnd(12)} ` +
        `angelegt ${employee.createdAt.toISOString().slice(0, 10)}${tags ? `  [${tags}]` : ""}`,
    );
    console.log(`  → ${recommendation}`);
    for (const blocker of hardBlockers) console.log(`    ! ${blocker.message}`);
    const history = preview.historical.map((item) => `${item.label}: ${item.count}`).join(", ");
    if (history) console.log(`    Historie: ${history}`);
  }

  if (orphanUsers.length) {
    console.log("\nBenutzerkonten ohne Mitarbeiter:");
    for (const user of orphanUsers) console.log(`  ${user.login} (${user.role.code}, ${user.active ? "aktiv" : "inaktiv"})`);
  }
  console.log("\nEs wurde nichts verändert.\n");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
