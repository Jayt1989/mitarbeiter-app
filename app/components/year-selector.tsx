import { currentBerlinYear, yearOptions } from "@/lib/calendar";

const buttonClass =
  "min-h-10 rounded-lg border border-[#dce4dc] bg-white px-3 text-xs font-medium text-[#526056] transition hover:bg-[#f2f6f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174c37] sm:text-sm";

export default function YearSelector({
  year,
  onChange,
  label = "Jahr auswählen",
}: {
  year: number;
  onChange: (year: number) => void;
  label?: string;
}) {
  const currentYear = currentBerlinYear();

  return (
    <div className="flex flex-wrap items-end gap-2" role="group" aria-label={label}>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-[#526056]">{label}</span>
        <select
          value={year}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-10 w-28 rounded-lg border border-[#dce4dc] bg-white px-3 text-sm text-[#27372d] outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10"
        >
          {yearOptions(year, currentYear).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => onChange(year - 1)} className={buttonClass}>
        Vorheriges Jahr
      </button>
      <button
        type="button"
        onClick={() => onChange(currentYear)}
        className="min-h-10 rounded-lg border border-[#cbd9ce] bg-[#eaf2eb] px-3 text-xs font-semibold text-[#285e3e] transition hover:bg-[#dfece1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174c37] sm:text-sm"
      >
        Aktuelles Jahr
      </button>
      <button type="button" onClick={() => onChange(year + 1)} className={buttonClass}>
        Nächstes Jahr
      </button>
    </div>
  );
}
