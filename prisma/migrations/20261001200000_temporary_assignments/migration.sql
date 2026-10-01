-- CreateTable
CREATE TABLE "TemporaryAssignment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "shift" "ShiftCode",
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "TemporaryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TemporaryAssignment_employeeId_startDate_endDate_idx" ON "TemporaryAssignment"("employeeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "TemporaryAssignment_departmentId_startDate_endDate_idx" ON "TemporaryAssignment"("departmentId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "TemporaryAssignment" ADD CONSTRAINT "TemporaryAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporaryAssignment" ADD CONSTRAINT "TemporaryAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporaryAssignment" ADD CONSTRAINT "TemporaryAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Neue Berechtigung „Einsatzplanung bearbeiten“, standardmäßig nur für die Admin-Rolle
INSERT INTO "Permission" ("id", "key", "label")
VALUES ('perm_edit_assignments', 'editAssignments', 'Einsatzplanung bearbeiten')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "allowed")
SELECT r."id", p."id", r."code" = 'ADMIN'
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."key" = 'editAssignments'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
