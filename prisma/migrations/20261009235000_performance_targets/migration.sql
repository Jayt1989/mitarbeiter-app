-- Soll-Leistung (Stück/Std.) wird je Eintrag gespeichert, damit spätere Soll-Änderungen
-- bestehende Auswertungen nicht verfälschen. Rein additiv, keine Daten werden gelöscht.

-- AlterTable
ALTER TABLE "PerformanceEntry" ADD COLUMN "targetPerHour" INTEGER;

ALTER TABLE "PerformanceEntry"
  ADD CONSTRAINT "PerformanceEntry_targetPerHour_check" CHECK ("targetPerHour" IS NULL OR "targetPerHour" > 0);

-- Bereits erfasste Einträge erhalten das aktuell gültige Soll ihres Arbeitsplatzes.
UPDATE "PerformanceEntry"
SET "targetPerHour" = CASE "workstation"
  WHEN 'K01' THEN 500
  WHEN 'K02' THEN 450
  WHEN 'K03' THEN 520
  WHEN 'VP1' THEN 300
  WHEN 'VP2' THEN 350
  WHEN 'VP3' THEN 280
END
WHERE "targetPerHour" IS NULL;
