import { sampleAreaConfiguration, type AreaConfiguration } from "./areas-data";

const storageKey = "mitarbeiter-app.bereiche.v1";

export interface AreaRepository {
  load(): Promise<AreaConfiguration>;
  save(configuration: AreaConfiguration): Promise<void>;
}

function isConfiguration(value: unknown): value is AreaConfiguration {
  if (!value || typeof value !== "object") return false;

  const configuration = value as Record<string, unknown>;
  if (!Array.isArray(configuration.areas) || !configuration.minimums || typeof configuration.minimums !== "object") {
    return false;
  }

  const minimums = configuration.minimums as Record<string, Record<string, unknown>>;
  return configuration.areas.every((area) => {
    if (!area || typeof area !== "object") return false;
    const entry = area as Record<string, unknown>;
    const areaMinimums = minimums[String(entry.id)];
    return (
      typeof entry.id === "string" &&
      typeof entry.name === "string" &&
      typeof entry.active === "boolean" &&
      !!areaMinimums &&
      ["Früh", "Spät", "Nacht"].every((shift) => {
        const shiftMinimum = areaMinimums[shift] as Record<string, unknown> | undefined;
        return (
          !!shiftMinimum &&
          typeof shiftMinimum.minimum === "number" &&
          shiftMinimum.minimum >= 0 &&
          (shiftMinimum.qualificationId === null || typeof shiftMinimum.qualificationId === "string") &&
          typeof shiftMinimum.minimumQualified === "number" &&
          shiftMinimum.minimumQualified >= 0
        );
      })
    );
  });
}

function copyDefaults(): AreaConfiguration {
  return {
    areas: sampleAreaConfiguration.areas.map((area) => ({ ...area })),
    minimums: Object.fromEntries(
      Object.entries(sampleAreaConfiguration.minimums).map(([areaId, shiftMinimums]) => [
        areaId,
        Object.fromEntries(
          Object.entries(shiftMinimums).map(([shift, shiftMinimum]) => [shift, { ...shiftMinimum }]),
        ),
      ]),
    ) as AreaConfiguration["minimums"],
  };
}


export const areaRepository: AreaRepository = {
  async load() {
    try {
      const response = await fetch("/api/areas", { cache: "no-store" });
      if (response.ok) return (await response.json()) as AreaConfiguration;
    } catch {
      // Datenbank nicht erreichbar, lokalen Stand verwenden.
    }
    if (typeof window === "undefined") return copyDefaults();

    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === null) return copyDefaults();
      const configuration: unknown = JSON.parse(stored);
      return isConfiguration(configuration) ? configuration : copyDefaults();
    } catch {
      return copyDefaults();
    }
  },

  async save(configuration) {
    try {
      const response = await fetch("/api/areas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configuration),
      });
      if (response.ok) return;
    } catch {
      // Datenbank nicht erreichbar, lokal zwischenspeichern.
    }
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(configuration));
  },
};
