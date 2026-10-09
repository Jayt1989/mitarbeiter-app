-- Nicht-destruktiv: bestehende Benutzer behalten ihr Passwort und müssen es nicht ändern.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- E-Mail wird optional; vorhandene Adressen bleiben erhalten.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "Employee" ALTER COLUMN "email" DROP NOT NULL;
