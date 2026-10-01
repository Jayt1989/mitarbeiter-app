import type { ActiveShift } from "../schichtplan/rotation";

export type WorkArea = {
  id: string;
  name: string;
  active: boolean;
};

export type ShiftMinimum = {
  minimum: number;
  /** Qualifikation, die für die Mindestqualifikation dieser Schicht zählt. */
  qualificationId: string | null;
  minimumQualified: number;
};

export type AreaMinimums = Record<string, Record<ActiveShift, ShiftMinimum>>;

export type AreaConfiguration = {
  areas: WorkArea[];
  minimums: AreaMinimums;
};

export const sampleAreaConfiguration: AreaConfiguration = {
  areas: [
    { id: "packaging", name: "Verpackung / Kommissionierung", active: true },
    { id: "autosort", name: "Autosort", active: true },
    { id: "loading", name: "Verladung", active: true },
  ],
  minimums: {
    packaging: {
      Früh: { minimum: 6, qualificationId: "packaging", minimumQualified: 3 },
      Spät: { minimum: 5, qualificationId: "packaging", minimumQualified: 3 },
      Nacht: { minimum: 3, qualificationId: "packaging", minimumQualified: 2 },
    },
    autosort: {
      Früh: { minimum: 4, qualificationId: "autosort", minimumQualified: 3 },
      Spät: { minimum: 4, qualificationId: "autosort", minimumQualified: 3 },
      Nacht: { minimum: 2, qualificationId: "autosort", minimumQualified: 1 },
    },
    loading: {
      Früh: { minimum: 3, qualificationId: "loading", minimumQualified: 2 },
      Spät: { minimum: 3, qualificationId: "loading", minimumQualified: 2 },
      Nacht: { minimum: 2, qualificationId: "loading", minimumQualified: 1 },
    },
  },
};
