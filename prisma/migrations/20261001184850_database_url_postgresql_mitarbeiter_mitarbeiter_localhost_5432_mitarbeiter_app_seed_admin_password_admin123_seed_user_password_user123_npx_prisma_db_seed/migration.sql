-- CreateEnum
CREATE TYPE "ShiftCode" AS ENUM ('EARLY', 'LATE', 'NIGHT', 'OFF');

-- CreateEnum
CREATE TYPE "VacationStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AbsenceType" AS ENUM ('SICK', 'TRAINING', 'SPECIAL_LEAVE', 'TIME_OFF', 'OTHER');

-- CreateEnum
CREATE TYPE "AbsenceStatus" AS ENUM ('RECORDED', 'APPROVED', 'REQUESTED');

-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('ROTATION', 'MANUAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "roleId" TEXT NOT NULL,
    "employeeId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "personnelNumber" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "annualLeaveAllowance" INTEGER NOT NULL DEFAULT 30,
    "carryOverLeaveDays" INTEGER NOT NULL DEFAULT 0,
    "shiftModelId" TEXT NOT NULL,
    "shiftGroupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "EmployeePermission" (
    "employeeId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeePermission_pkey" PRIMARY KEY ("employeeId","permissionId")
);

-- CreateTable
CREATE TABLE "ShiftModel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rotationOrder" "ShiftCode"[],
    "workingWeekdays" INTEGER[],
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShiftModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startShift" "ShiftCode" NOT NULL,
    "anchorDate" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShiftGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDepartment" (
    "employeeId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeDepartment_pkey" PRIMARY KEY ("employeeId","departmentId")
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shift" "ShiftCode" NOT NULL,
    "source" "AssignmentSource" NOT NULL DEFAULT 'ROTATION',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Absence" (
    "id" TEXT NOT NULL,
    "seedKey" TEXT,
    "employeeId" TEXT NOT NULL,
    "type" "AbsenceType" NOT NULL,
    "status" "AbsenceStatus" NOT NULL DEFAULT 'RECORDED',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VacationRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "daysRequested" INTEGER NOT NULL,
    "status" "VacationStatus" NOT NULL DEFAULT 'REQUESTED',
    "comment" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VacationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VacationAccount" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "annualAllowance" INTEGER NOT NULL,
    "carryOverDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VacationAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinimumStaffing" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "shift" "ShiftCode" NOT NULL,
    "minimum" INTEGER NOT NULL DEFAULT 0,
    "qualificationId" TEXT,
    "minimumQualified" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MinimumStaffing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Qualification" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Qualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeQualification" (
    "employeeId" TEXT NOT NULL,
    "qualificationId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "certifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "EmployeeQualification_pkey" PRIMARY KEY ("employeeId","qualificationId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "oldValues" JSONB,
    "newValues" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE INDEX "User_active_roleId_idx" ON "User"("active", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_personnelNumber_key" ON "Employee"("personnelNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_lastName_firstName_idx" ON "Employee"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Employee_isActive_shiftModelId_shiftGroupId_idx" ON "Employee"("isActive", "shiftModelId", "shiftGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE INDEX "Role_name_idx" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "EmployeePermission_permissionId_allowed_idx" ON "EmployeePermission"("permissionId", "allowed");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftModel_code_key" ON "ShiftModel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftGroup_code_key" ON "ShiftGroup"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Department_active_name_idx" ON "Department"("active", "name");

-- CreateIndex
CREATE INDEX "EmployeeDepartment_departmentId_isPrimary_idx" ON "EmployeeDepartment"("departmentId", "isPrimary");

-- CreateIndex
CREATE INDEX "ShiftAssignment_date_shift_idx" ON "ShiftAssignment"("date", "shift");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftAssignment_employeeId_date_key" ON "ShiftAssignment"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Absence_seedKey_key" ON "Absence"("seedKey");

-- CreateIndex
CREATE INDEX "Absence_employeeId_startDate_endDate_idx" ON "Absence"("employeeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "Absence_type_status_startDate_idx" ON "Absence"("type", "status", "startDate");

-- CreateIndex
CREATE INDEX "VacationRequest_employeeId_status_startDate_endDate_idx" ON "VacationRequest"("employeeId", "status", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "VacationRequest_status_startDate_idx" ON "VacationRequest"("status", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "VacationAccount_employeeId_year_key" ON "VacationAccount"("employeeId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "MinimumStaffing_departmentId_shift_key" ON "MinimumStaffing"("departmentId", "shift");

-- CreateIndex
CREATE UNIQUE INDEX "Qualification_code_key" ON "Qualification"("code");

-- CreateIndex
CREATE INDEX "EmployeeQualification_qualificationId_validUntil_idx" ON "EmployeeQualification"("qualificationId", "validUntil");

-- CreateIndex
CREATE INDEX "AuditLog_occurredAt_idx" ON "AuditLog"("occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_occurredAt_idx" ON "AuditLog"("actorUserId", "occurredAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_shiftModelId_fkey" FOREIGN KEY ("shiftModelId") REFERENCES "ShiftModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_shiftGroupId_fkey" FOREIGN KEY ("shiftGroupId") REFERENCES "ShiftGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePermission" ADD CONSTRAINT "EmployeePermission_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePermission" ADD CONSTRAINT "EmployeePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDepartment" ADD CONSTRAINT "EmployeeDepartment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDepartment" ADD CONSTRAINT "EmployeeDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacationAccount" ADD CONSTRAINT "VacationAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinimumStaffing" ADD CONSTRAINT "MinimumStaffing_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinimumStaffing" ADD CONSTRAINT "MinimumStaffing_qualificationId_fkey" FOREIGN KEY ("qualificationId") REFERENCES "Qualification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeQualification" ADD CONSTRAINT "EmployeeQualification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeQualification" ADD CONSTRAINT "EmployeeQualification_qualificationId_fkey" FOREIGN KEY ("qualificationId") REFERENCES "Qualification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
