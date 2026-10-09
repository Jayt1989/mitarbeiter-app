"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ShiftSwapDto, SwapDay } from "@/lib/shift-swaps";
import type { SwapStaffingPreview } from "@/lib/shift-swap-staffing";
import { swapStatusLabels, openSwapStatuses, type SwapAction } from "@/lib/shift-swap-rules";
import { berlinTodayKey, dateKeyToUtc } from "@/lib/calendar";
import { notificationDate } from "@/lib/notification-messages";
import { refreshNotifications } from "@/app/components/notification-events";

const button = "min-h-11 rounded-lg bg-[#174c37] px-4 py-2 text-sm font-semibold text-white hover:bg-[#103d2b] disabled:opacity-50";
const secondary = "min-h-11 rounded-lg border border-[#dce4dc] bg-white px-4 py-2 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee] disabled:opacity-50";
const input = "mt-1 h-11 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm text-[#27372d] focus:border-[#71937d]";

type Partners = { own: SwapDay | null; partners: SwapDay[] };
type ApiError = { error?: string; warnings?: string[] };
type StaffingCheck = { key: string; warnings: string[]; error: string };

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error([body?.error ?? "Schichttausch konnte nicht verarbeitet werden.", ...body?.warnings ?? []].join("\n"));
  }
  return (await response.json()) as T;
}

export default function SwapBoard({ initialRequests, employeeId, review = false, initialDate, canViewStaffing = false }: {
  initialRequests: ShiftSwapDto[]; employeeId: string | null; review?: boolean; initialDate?: string; canViewStaffing?: boolean;
}) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [date, setDate] = useState(initialDate ?? berlinTodayKey());
  const [partnerId, setPartnerId] = useState("");
  const [comment, setComment] = useState("");
  const [partners, setPartners] = useState<Partners | null>(null);
  const [partnersLoading, setPartnersLoading] = useState(!review);
  const [partnersError, setPartnersError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; data: SwapStaffingPreview } | null>(null);
  const [filter, setFilter] = useState<"all" | "outgoing" | "incoming" | "open">("all");
  const [staffingCheck, setStaffingCheck] = useState<StaffingCheck | null>(null);
  const [staffingRetry, setStaffingRetry] = useState(0);
  const staffingKey = `${date}:${partnerId}`;

  const reload = useCallback(() => fetch(`/api/shift-swaps${review ? "?review=true" : ""}`, { cache: "no-store" })
    .then(readResponse<ShiftSwapDto[]>).then((data) => { setRequests(data); setPreview(null); setError(""); })
    .catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : "Anfragen konnten nicht geladen werden."); }), [review]);

  useEffect(() => {
    const refresh = () => { void reload(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [reload]);

  useEffect(() => {
    if (review) return;
    const controller = new AbortController();
    void fetch(`/api/shift-swaps/partners?date=${encodeURIComponent(date)}`, {
      cache: "no-store", signal: controller.signal,
    }).then(readResponse<Partners>).then((data) => {
      if (controller.signal.aborted) return;
      setPartners(data);
      setPartnersError("");
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setPartners(null);
      setPartnersError(cause instanceof Error ? cause.message : "Tauschpartner konnten nicht geladen werden.");
    }).finally(() => {
      if (!controller.signal.aborted) setPartnersLoading(false);
    });
    return () => controller.abort();
  }, [date, review, requests]);

  const partner = partners?.partners.find((entry) => entry.id === partnerId);
  const warnings = [...partners?.own?.warnings ?? [], ...partner?.warnings ?? []];
  if (partner?.shift && partner.shift === partners?.own?.shift) {
    warnings.push("Beide Mitarbeiter haben dieselbe Schicht. Bitte einen anderen Partner auswählen.");
  }
  const canCheckStaffing = !review && !!partner && !!partners?.own && !warnings.length;
  const staffingReady = staffingCheck?.key === staffingKey && !staffingCheck.error;
  useEffect(() => {
    if (!canCheckStaffing) return;
    const controller = new AbortController();
    void fetch(`/api/shift-swaps/staffing?date=${encodeURIComponent(date)}&partnerId=${encodeURIComponent(partnerId)}`, {
      cache: "no-store", signal: controller.signal,
    }).then(readResponse<{ warnings: string[] }>).then((data) => {
      if (!controller.signal.aborted) setStaffingCheck({ key: staffingKey, warnings: data.warnings, error: "" });
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setStaffingCheck({
        key: staffingKey, warnings: [],
        error: cause instanceof Error ? cause.message : "Personalbesetzung konnte nicht geprüft werden.",
      });
    });
    return () => controller.abort();
  }, [canCheckStaffing, date, partnerId, staffingKey, staffingRetry, requests]);
  const visible = requests.filter((request) => filter === "outgoing" ? request.requesterId === employeeId
    : filter === "incoming" ? request.partnerId === employeeId
    : filter === "open" ? openSwapStatuses.some((status) => status === request.status) : true);

  async function mutate(action: SwapAction, id: string) {
    setPending(id);
    setError("");
    setNotice("");
    try {
      const updated = await readResponse<ShiftSwapDto>(await fetch("/api/shift-swaps", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }),
      }));
      setRequests((current) => current.map((entry) => entry.id === id ? updated : entry));
      setPreview(null);
      setNotice(action === "approve"
        ? "Tausch genehmigt. Beide Tagesschichten sind gespeichert; die Besetzung wird beim nächsten Abruf aus dem aktualisierten Plan berechnet."
        : "Anfrage aktualisiert. Ohne Genehmigung bleiben die Schichten unverändert.");
      refreshNotifications();
      window.dispatchEvent(new Event("planning:changed"));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Anfrage konnte nicht aktualisiert werden.");
    } finally {
      setPending(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("create");
    setError("");
    setNotice("");
    try {
      const created = await readResponse<ShiftSwapDto>(await fetch("/api/shift-swaps", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, partnerId, comment }),
      }));
      setRequests((current) => [created, ...current]);
      setComment("");
      setPartnerId("");
      setNotice("Tauschanfrage gesendet. Die Schichten ändern sich erst nach Zustimmung und Freigabe.");
      refreshNotifications();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tauschanfrage konnte nicht gesendet werden.");
    } finally {
      setPending(null);
    }
  }

  async function checkStaffing(id: string) {
    setPending(id);
    setError("");
    try {
      const data = await readResponse<SwapStaffingPreview>(await fetch(`/api/shift-swaps/staffing?id=${encodeURIComponent(id)}`, { cache: "no-store" }));
      setPreview({ id, data });
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : "Personalbesetzung konnte nicht geprüft werden.");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">{review ? "ADMIN / VORARBEITER · FREIGABE" : "DEINE PLANUNG"}</p>
      <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Schichttausch</h1>
      <p className="mt-2 text-sm leading-6 text-[#68766d]">Erst die Zustimmung des Tauschpartners und anschließend die Freigabe durch Admin oder Vorarbeiter machen den Tausch wirksam.</p>
      {error && <p role="alert" className="mt-5 whitespace-pre-line rounded-lg border border-[#efb8ad] bg-[#fff0ec] p-4 text-sm text-[#a33e31]">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-lg border border-[#b9dcc2] bg-[#eef7f0] p-4 text-sm text-[#256440]">{notice}</p>}
      {!review && (
        <section className="mt-6 rounded-xl border border-[#e0e7e0] bg-white p-4 sm:p-6" aria-labelledby="swap-form-title">
          <h2 id="swap-form-title" className="text-lg font-semibold">Schichttausch anfragen</h2>
          <form onSubmit={submit} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">Datum
                <input type="date" required min={berlinTodayKey()} value={date} className={input}
                  onChange={(event) => {
                    setDate(event.target.value); setPartnerId(""); setPartners(null);
                    setPartnersLoading(true); setPartnersError(""); setStaffingCheck(null);
                  }} />
              </label>
              <div>
                <p className="text-sm font-medium">Eigene Schicht</p>
                <p className="mt-1 flex min-h-11 items-center rounded-lg bg-[#f4f6f2] px-3 text-sm">
                  {partnersLoading ? "Wird geladen …" : partners?.own ? `${partners.own.shift ?? "Nicht geplant"} · ${partners.own.area ?? "Ohne Bereich"}` : "Kein aktiver Mitarbeiter zugeordnet"}
                </p>
              </div>
            </div>
            <label className="block text-sm font-medium">Tauschpartner
              <select required value={partnerId} disabled={partnersLoading || !partners} className={input}
                onChange={(event) => { setPartnerId(event.target.value); setStaffingCheck(null); }}>
                <option value="">Aktiven Mitarbeiter auswählen</option>
                {partners?.partners.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} · {entry.area ?? "Ohne Bereich"} · {entry.shift ?? "Nicht geplant"}{entry.warnings.length ? " · Nicht verfügbar" : ""}
                  </option>
                ))}
              </select>
            </label>
            {partnersError && <p role="alert" className="text-sm text-[#a33e31]">{partnersError}</p>}
            {warnings.length > 0 && (
              <div role="alert" className="rounded-lg border border-[#efd49a] bg-[#fff3d9] p-3 text-sm text-[#886719]">
                <p className="font-semibold">Tausch derzeit nicht möglich:</p>
                <ul className="mt-1 list-inside list-disc">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              </div>
            )}
            {partner && partners?.own && !warnings.length && (
              <p className="text-sm text-[#526056]">Nach Genehmigung: Du {partners.own.shift} → {partner.shift}; {partner.name} {partner.shift} → {partners.own.shift}.</p>
            )}
            {canCheckStaffing && (
              <div role={staffingCheck?.error ? "alert" : "status"} className="rounded-lg border border-[#efd49a] bg-[#fff3d9] p-3 text-sm text-[#886719]">
                {staffingCheck?.key !== staffingKey ? <p>Mindestbesetzung und Qualifikationen werden geprüft …</p>
                  : staffingCheck.error ? (
                    <>
                      <p>{staffingCheck.error}</p>
                      <button type="button" className="mt-2 min-h-11 underline" onClick={() => {
                        setStaffingCheck(null); setStaffingRetry((current) => current + 1);
                      }}>Erneut prüfen</button>
                    </>
                  ) : (
                    <>
                      {staffingCheck.warnings.length
                        ? <ul className="list-inside list-disc">{staffingCheck.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                        : <p>Mindestbesetzung und Qualifikationsbesetzung sind nach dem Tausch erfüllt.</p>}
                      <p className="mt-1">Hinweise blockieren die Anfrage nicht. Admin oder Vorarbeiter entscheidet bei der Freigabe anhand des aktuellen Plans.</p>
                    </>
                  )}
              </div>
            )}
            <label className="block text-sm font-medium">Bemerkung (optional)
              <textarea maxLength={500} rows={3} value={comment} onChange={(event) => setComment(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[#dce4dc] bg-white p-3 text-sm" />
            </label>
            <p className="text-xs leading-5 text-[#77847b]">Urlaub, Abwesenheiten, manuelle Schichten, temporäre Einsätze und offene Tauschanfragen blockieren den Tausch. Bei Genehmigung wird erneut geprüft.</p>
            <button type="submit" disabled={pending !== null || partnersLoading || !partners?.own || !partner || warnings.length > 0 || !staffingReady} className={button}>
              {pending === "create" ? "Wird gesendet …" : "Schichttausch anfragen"}
            </button>
          </form>
        </section>
      )}
      <section className="mt-8" aria-labelledby="swap-list-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="swap-list-title" className="text-xl font-semibold">{review ? "Alle Tauschanfragen" : "Eigene und erhaltene Anfragen"}</h2>
          <button type="button" onClick={() => void reload()} className={secondary}>Aktualisieren</button>
        </div>
        <div className="my-4 flex flex-wrap gap-2">
          {([
            { value: "all", label: "Alle" },
            ...(!review ? [
              { value: "outgoing", label: "Eigene Anfragen" },
              { value: "incoming", label: "Erhaltene Anfragen" },
            ] as const : []),
            { value: "open", label: "Offen" },
          ] as const).map(({ value, label }) => (
            <button key={value} type="button" aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`${secondary} ${filter === value ? "bg-[#e8f0e9]" : ""}`}>
              {label}
            </button>
          ))}
        </div>
        {!visible.length && <p className="rounded-xl border border-[#e0e7e0] bg-white p-5 text-sm text-[#68766d]">Keine Tauschanfragen in dieser Ansicht.</p>}
        <ul className="space-y-4">
          {visible.map((swap) => (
            <li key={swap.id} className="rounded-xl border border-[#e0e7e0] bg-white p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{notificationDate(dateKeyToUtc(swap.date))}</h3>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${swap.status === "GENEHMIGT" ? "bg-[#e7f3e9] text-[#256440]" : "bg-[#eef0ed] text-[#526056]"}`}>{swapStatusLabels[swap.status]}</span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-[#77847b]">Antragsteller</p>
                  <p className="mt-1 text-sm font-semibold">{swap.requesterName}</p>
                  <p className="mt-1 text-sm text-[#68766d]">{swap.requesterArea ?? "Ohne Bereich"}</p>
                  <p className="mt-2 text-sm">Bisher: <strong>{swap.requesterOriginalShift}</strong> · Neu: <strong>{swap.partnerOriginalShift}</strong></p>
                </div>
                <div>
                  <p className="text-xs text-[#77847b]">Tauschpartner</p>
                  <p className="mt-1 text-sm font-semibold">{swap.partnerName}</p>
                  <p className="mt-1 text-sm text-[#68766d]">{swap.partnerArea ?? "Ohne Bereich"}</p>
                  <p className="mt-2 text-sm">Bisher: <strong>{swap.partnerOriginalShift}</strong> · Neu: <strong>{swap.requesterOriginalShift}</strong></p>
                </div>
              </div>
              <p className="mt-3 text-xs text-[#77847b]">{swap.status === "GENEHMIGT" ? "Die neuen Schichten sind wirksam." : "Die neuen Schichten sind nicht wirksam."}</p>
              {swap.comment && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-[#526056]">Bemerkung: {swap.comment}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {!review && employeeId === swap.partnerId && swap.status === "ANGEFRAGT" && (
                  <>
                    <button type="button" disabled={pending !== null} onClick={() => void mutate("confirm", swap.id)} className={button}>Bestätigen</button>
                    <button type="button" disabled={pending !== null} onClick={() => void mutate("decline", swap.id)} className={secondary}>Ablehnen</button>
                  </>
                )}
                {!review && employeeId === swap.requesterId && openSwapStatuses.some((status) => status === swap.status) && (
                  <button type="button" disabled={pending !== null} onClick={() => void mutate("cancel", swap.id)} className={secondary}>Stornieren</button>
                )}
                {review && swap.status === "PARTNER_BESTAETIGT" && (
                  <>
                    <button type="button" disabled={pending !== null} onClick={() => void checkStaffing(swap.id)} className={secondary}>Besetzung prüfen</button>
                    <button type="button" disabled={pending !== null} onClick={() => void mutate("approve", swap.id)} className={button}>Genehmigen</button>
                    <button type="button" disabled={pending !== null} onClick={() => void mutate("reject", swap.id)} className={secondary}>Ablehnen</button>
                  </>
                )}
              </div>
              {preview?.id === swap.id && <StaffingPreview data={preview.data} />}
              {review && swap.status === "GENEHMIGT" && (
                <Link href={canViewStaffing ? `/admin?date=${swap.date}` : "/schichtplan"} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-[#174c37] underline">
                  {canViewStaffing ? "Aktuelle Personalbesetzung ansehen" : "Aktualisierten Schichtplan ansehen"}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function StaffingPreview({ data }: { data: SwapStaffingPreview }) {
  return (
    <section aria-label="Auswirkungen auf die Personalbesetzung" className="mt-4 rounded-lg border border-[#dce4dc] bg-[#f8faf7] p-3">
      <h4 className="text-sm font-semibold">Personalbesetzung vor / nach dem Tausch</h4>
      <p className="mt-1 text-xs text-[#68766d]">Bestehende Mindest- und Qualifikationsbesetzung. Bereiche bleiben unverändert; nur die Schichten werden getauscht.</p>
      <ul className="mt-3 space-y-2">
        {data.after.areas.map((area, index) => (
          <li key={`${area.area}:${area.shift}`} className={`rounded-lg p-2 text-sm ${area.trafficLight === "red" ? "bg-[#fde9e7] text-[#a33e31]" : "bg-white text-[#526056]"}`}>
            <strong>{area.area} · {area.shift}</strong>: {data.before.areas[index]?.available} → {area.available} verfügbar, Minimum {area.minimum}
            {area.minimumQualified > 0 && <span> · Qualifiziert: {data.before.areas[index]?.qualifiedAvailable} → {area.qualifiedAvailable}, Minimum {area.minimumQualified}</span>}
            {area.trafficLight === "red" && <span className="font-semibold"> · Unterbesetzt</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
