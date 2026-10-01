-- CreateEnum
CREATE TYPE "CompanyDayType" AS ENUM ('CLOSURE', 'INVENTORY', 'PLANT_HOLIDAY', 'STAFF_MEETING', 'SPECIAL_WORKDAY', 'OTHER');

-- CreateTable
CREATE TABLE "CalendarSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "country" TEXT NOT NULL DEFAULT 'DE',
    "state" TEXT NOT NULL DEFAULT 'NW',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDay" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "CompanyDayType" NOT NULL,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyDay_date_active_idx" ON "CompanyDay"("date", "active");

-- AddForeignKey
ALTER TABLE "CompanyDay" ADD CONSTRAINT "CompanyDay_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Standardregion Deutschland / Nordrhein-Westfalen
INSERT INTO "CalendarSettings" ("id", "country", "state", "updatedAt")
VALUES ('default', 'DE', 'NW', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Neue Berechtigungen, standardmäßig nur für die Admin-Rolle
INSERT INTO "Permission" ("id", "key", "label")
VALUES
  ('perm_edit_calendar', 'editCalendar', 'Feiertage & Kalender bearbeiten'),
  ('perm_manage_vacation_years', 'manageVacationYears', 'Urlaubsjahre verwalten')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "allowed")
SELECT r."id", p."id", r."code" = 'ADMIN'
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."key" IN ('editCalendar', 'manageVacationYears')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
