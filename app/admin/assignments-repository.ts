import type {
  QualificationCheck,
  TemporaryAssignment,
  TemporaryAssignmentInput,
} from "./assignments-data";
import { refreshNotifications } from "@/app/components/notification-events";

type MutationResult = {
  assignment: TemporaryAssignment;
  qualificationCheck: QualificationCheck | null;
};

async function send(method: "POST" | "PATCH", body: unknown): Promise<MutationResult> {
  const response = await fetch("/api/temporary-assignments", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(error?.error ?? "Der Einsatz konnte nicht gespeichert werden.");
  }
  const result = (await response.json()) as MutationResult;
  refreshNotifications();
  return result;
}

export const assignmentRepository = {
  async loadAll(): Promise<TemporaryAssignment[]> {
    try {
      const response = await fetch("/api/temporary-assignments", { cache: "no-store" });
      if (response.ok) return (await response.json()) as TemporaryAssignment[];
    } catch {
      // Datenbank nicht erreichbar, ohne temporäre Einsätze weiterarbeiten.
    }
    return [];
  },

  create(input: TemporaryAssignmentInput) {
    return send("POST", input);
  },

  update(id: string, input: Omit<TemporaryAssignmentInput, "employeeId">) {
    return send("PATCH", { ...input, id, action: "update" });
  },

  cancel(id: string) {
    return send("PATCH", { id, action: "cancel" });
  },
};
