import Link from "@/app/components/access-link";
import NotificationBell from "@/app/components/notification-bell";
import { requirePageAccess } from "@/lib/page-access";
import { homeDestinations } from "@/lib/home-access";
import { performanceHomeLink } from "@/lib/performance-rules";
import MessageUnreadBadge from "@/app/components/message-unread-badge";

export default async function Home() {
  const context = await requirePageAccess("/");
  const destinations = homeDestinations(context);
  const performanceLink = performanceHomeLink(context);
  const areas = [
    {
      title: "Schichtplan",
      description: "Deine Dienste und Arbeitszeiten im Überblick.",
      label: "PLANUNG",
      href: destinations.shiftPlan,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="16" rx="2" />
          <path d="M7.5 3v4M16.5 3v4M4 9.5h16M8 13h2m4 0h2M8 17h2" />
        </svg>
      ),
      color: "bg-[#e1f2e8] text-[#197044]",
      marker: "bg-[#3c9a69]",
    },
    {
      title: "Urlaub",
      description: "Abwesenheiten planen und Urlaubsanträge verwalten.",
      label: "FREIZEIT",
      href: destinations.vacation,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 18.5 20 5.5M5.5 7.5l3 3m5-5 3 3M10 17l3 3m2-5 3 3" />
          <path d="m4 18.5 1.5 1.5M20 5.5 18.5 4" />
        </svg>
      ),
      color: "bg-[#fff0df] text-[#b65d22]",
      marker: "bg-[#e58a45]",
    },
    {
      title: "Mitarbeiter",
      description: "Lerne dein Team kennen und finde wichtige Kontakte.",
      label: "TEAM",
      href: destinations.employees,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19v-1.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V19h-11Z" />
          <path d="M16 5.3a3 3 0 0 1 0 5.8m2 2a4.5 4.5 0 0 1 2.5 4V19h-3" />
        </svg>
      ),
      color: "bg-[#e5eff9] text-[#316b9b]",
      marker: "bg-[#5d8eb8]",
    },
    {
      title: "Admin",
      description: "Verwaltung und Einstellungen für dein Unternehmen.",
      label: "VERWALTUNG",
      href: destinations.admin,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="m19.4 15 .1.1 1.2.9-1.2 2.1-1.4-.6a7.8 7.8 0 0 1-1.6.9l-.2 1.5h-2.4l-.2-1.5a7.8 7.8 0 0 1-1.6-.9l-1.4.6-1.2-2.1 1.2-.9a7.2 7.2 0 0 1 0-1.9l-1.2-.9 1.2-2.1 1.4.6a7.8 7.8 0 0 1 1.6-.9l.2-1.5h2.4l.2 1.5a7.8 7.8 0 0 1 1.6.9l1.4-.6 1.2 2.1-1.2.9a7.2 7.2 0 0 1 0 1.8Z" transform="translate(-1 -1) scale(1.08)" />
        </svg>
      ),
      color: "bg-[#f1eafa] text-[#7850a1]",
      marker: "bg-[#9272b6]",
    },
    ...(performanceLink ? [{
      title: performanceLink.title,
      description: performanceLink.text,
      label: "LEISTUNG",
      href: performanceLink.href,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 20V10m7 10V4m7 16v-7M3 20h18" />
        </svg>
      ),
      color: "bg-[#e1f2e8] text-[#197044]",
      marker: "bg-[#3c9a69]",
    }] : []),
    ...(destinations.additionalShifts ? [{
      title: "Zusatzschichten", description: "Eigene Zusatzschichten sehen oder Wochenendarbeit verwalten.",
      label: "WOCHENENDARBEIT", href: destinations.additionalShifts,
      icon: <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18m-9 3v6m-3-3h6" /></svg>,
      color: "bg-[#fff0df] text-[#b65d22]", marker: "bg-[#e58a45]",
    }] : []),
    ...(destinations.messages ? [{
      title: "Nachrichten", description: "Informationen lesen und direkt im privaten Verlauf antworten.",
      label: "KOMMUNIKATION", href: destinations.messages,
      icon: <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></svg>,
      color: "bg-[#e1f2e8] text-[#197044]", marker: "bg-[#3c9a69]",
    }] : []),
    ...([
      { title: "Qualifikationen", href: destinations.qualifications, description: "Freigeschaltete Qualifikationen im Überblick." },
      { title: "Schichttausch", href: destinations.shiftSwap, description: "Eigene Tauschanfragen oder Freigaben verwalten." },
    ].map((area) => ({
      ...area, label: "DEIN BEREICH",
      icon: <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>,
      color: "bg-[#e5eff9] text-[#316b9b]", marker: "bg-[#5d8eb8]",
    }))),
  ].filter((area) => area.href !== null);

  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
      <header className="border-b border-[#dce4dc] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">
              TP
            </span>
            <span className="hidden text-sm font-semibold tracking-[0.02em] sm:inline">
              TeamPlan
            </span>
          </div>
          <nav className="flex items-center gap-2" aria-label="Hauptnavigation">
            <span className="rounded-full border border-[#dce4dc] px-3 py-1.5 text-xs font-medium text-[#5f6f65]">Intern</span>
            <NotificationBell />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
        <section className="relative overflow-hidden rounded-2xl bg-[#174c37] px-6 py-9 text-white sm:px-10 sm:py-12">
          <div className="absolute -right-12 -top-20 size-64 rounded-full border border-white/10 sm:right-12 sm:top-[-8rem] sm:size-80" />
          <div className="absolute -right-2 -top-10 size-44 rounded-full border border-white/10 sm:right-24 sm:top-[-5rem] sm:size-56" />
          <p className="relative text-xs font-semibold tracking-[0.16em] text-[#a8d5b9]">
            WILLKOMMEN IN DEINEM TEAMPORTAL
          </p>
          <h1 className="relative mt-3 text-3xl font-semibold sm:text-5xl">
            TeamPlan
          </h1>
          <p className="relative mt-3 max-w-lg text-sm leading-6 text-[#d4e4d9] sm:text-base">
            Alles Wichtige für deinen Arbeitsalltag an einem Ort.
          </p>
        </section>

        <section className="mt-10 sm:mt-12" aria-labelledby="bereiche-titel">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-[#668071]">
                DEIN ÜBERBLICK
              </p>
              <h2 id="bereiche-titel" className="mt-1 text-xl font-semibold">
                Deine Bereiche
              </h2>
            </div>
            <span className="pb-0.5 text-sm text-[#6d7d72]">{areas.length} Bereiche</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {areas.map((area) => {
              const card = (
                <article className="group relative flex min-h-48 flex-col rounded-xl border border-[#e0e7e0] bg-white p-5 shadow-[0_2px_10px_rgba(28,43,35,0.03)] transition duration-200 hover:-translate-y-0.5 hover:border-[#bdcfc1] hover:shadow-[0_10px_24px_rgba(28,43,35,0.08)] sm:p-6">
                  <div className="flex items-start justify-between">
                    <span className={`flex size-12 items-center justify-center rounded-xl ${area.color}`}>
                      <svg
                        className="size-6 stroke-current stroke-[1.7]"
                        viewBox="0 0 24 24"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        {area.icon.props.children}
                      </svg>
                    </span>
                    <span className="flex items-center gap-2 pt-1 text-[10px] font-semibold tracking-[0.12em] text-[#7b897f]">
                      <span className={`size-1.5 rounded-full ${area.marker}`} />
                      {area.label}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{area.title}{area.href === "/nachrichten" && <MessageUnreadBadge />}</h3>
                  <p className="mt-1 max-w-sm text-sm leading-6 text-[#68766d]">
                    {area.description}
                  </p>
                </article>
              );

              return area.href ? (
                <Link
                  key={area.title}
                  href={area.href}
                  className="rounded-xl focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#174c37]"
                >
                  {card}
                </Link>
              ) : (
                <div key={area.title}>{card}</div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
