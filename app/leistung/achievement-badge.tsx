import { achievementLevel, type AchievementLevel } from "@/lib/performance-rules";

const styles: Record<AchievementLevel, string> = {
  reached: "border-[#cfe3d4] bg-[#eef7f0] text-[#174c37]",
  close: "border-[#ecd9a8] bg-[#fff8e6] text-[#7a5a12]",
  below: "border-[#f0c8bd] bg-[#fff2ed] text-[#9f422d]",
};

const titles: Record<AchievementLevel, string> = {
  reached: "Soll erreicht",
  close: "Soll knapp verfehlt",
  below: "Soll deutlich verfehlt",
};

const percentFormat = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function AchievementBadge({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-[#87928b]">Nicht hinterlegt</span>;
  const level = achievementLevel(percent);
  return (
    <span title={titles[level]}
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${styles[level]}`}>
      {percentFormat.format(percent)} %<span className="sr-only"> – {titles[level]}</span>
    </span>
  );
}
