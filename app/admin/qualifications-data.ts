export const qualificationLevels = [0, 1, 2, 3] as const;
export type QualificationLevel = (typeof qualificationLevels)[number];

export const qualificationLevelLabels: Record<QualificationLevel, string> = {
  0: "Keine Qualifikation",
  1: "Eingewiesen",
  2: "Selbstständig",
  3: "Sehr sicher / Multiplikator",
};

export const qualificationLevelShortLabels: Record<QualificationLevel, string> = {
  0: "Keine",
  1: "Eingewiesen",
  2: "Selbstständig",
  3: "Multiplikator",
};

/** Ab dieser Stufe gilt ein Mitarbeiter als „ausreichend qualifiziert“. */
export const QUALIFIED_LEVEL_THRESHOLD: QualificationLevel = 2;

export type Qualification = {
  id: string;
  name: string;
  active: boolean;
};

export const sampleQualifications: Qualification[] = [
  { id: "packaging", name: "Verpackung", active: true },
  { id: "picking", name: "Kommissionierung", active: true },
  { id: "autosort", name: "Autosort", active: true },
  { id: "loading", name: "Verladung", active: true },
  { id: "high-rack", name: "Hochregal", active: true },
  { id: "shipping-office", name: "Versandbüro", active: true },
  { id: "forklift-license", name: "Staplerschein", active: true },
];
