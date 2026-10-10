This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## In-App-Benachrichtigungen

Die Glocke in der Navigation zeigt die Anzahl ungelesener Nachrichten und die
fünf letzten Nachrichten. Unter `/benachrichtigungen` stehen alle eigenen
Nachrichten mit Einzel- und Sammelmarkierung als gelesen bereit. Das persönliche
Dashboard zeigt zusätzlich die letzten drei Nachrichten.

Benachrichtigungen entstehen beim Genehmigen/Ablehnen von Urlaub, bei geänderten
manuellen Schichtzuweisungen, beim Anlegen/Ändern/Stornieren temporärer Einsätze
und bei neu erworbenen Qualifikationen (Stufe 0/kein Eintrag auf Stufe 1–3).
Unveränderte Speichervorgänge erzeugen keine neuen Nachrichten.
Die bestehenden `ShiftAssignment`-Einträge mit Quelle `MANUAL` dienen auch als
Overrides für rotierende Schichtmodelle; `Frei` wird dabei ebenfalls unterstützt.
Die automatisch gespeicherte Rotation wird nicht als Override verwendet.
Ein separates `ShiftOverride`-Modell existiert nicht.

Jede Änderung und ihre Benachrichtigung werden gemeinsam in einer Transaktion
gespeichert. Schreibfehler bei Mitarbeiterdaten und Qualifikationszuweisungen
werden angezeigt statt als erfolgreiche lokale Speicherung behandelt.
Lese-Fallbacks der bestehenden Funktionen bleiben erhalten.
Nachrichten werden beim Seitenwechsel, Öffnen der Glocke, Fensterfokus und nach
erfolgreichen Aktionen neu geladen. Es gibt keine WebSockets und kein Polling.
Andere Mitarbeiter sehen neue Nachrichten bei ihrem nächsten Abruf.
Auch Schichttausch-Anfragen, Partnerentscheidungen, Freigaben, Ablehnungen und
Stornierungen verwenden diese Nachrichten.

`Notification` ist über `employeeId` dem Mitarbeiter zugeordnet (auch ohne
bereits vorhandenes Login). Die API ermittelt diese ID ausschließlich aus der
serverseitig geprüften Anmeldung. Adminrechte geben keinen Zugriff auf fremde
Nachrichten. Benutzer ohne Mitarbeiterzuordnung sehen einen leeren Posteingang.
Die optionale Verlinkung führt zu bestehenden Seiten; deren eigene
Berechtigungsprüfungen gelten weiterhin.

### Lokal

`DATABASE_URL` muss auf die lokale Entwicklungsdatenbank zeigen (Umgebungsvariable
oder `.env`). Anschließend:

```bash
npx prisma validate
npx prisma migrate dev
npx prisma generate
npm run lint
npx tsx --test lib/notification-messages.test.ts lib/notifications.test.ts app/schichtplan/rotation.test.ts
npm run build
npm run dev
```

Next.js liest auch `.env.local`, die Prisma-CLI jedoch nicht automatisch.
Wenn die lokale Verbindung ausschließlich dort steht, können Prisma-Befehle
mit Node geladen werden, beispielsweise:

```bash
node --env-file=.env.local node_modules/prisma/build/index.js validate
node --env-file=.env.local node_modules/prisma/build/index.js migrate dev
node --env-file=.env.local node_modules/prisma/build/index.js generate
```

Die Migration `20261002120000_notifications` ist bereits enthalten. Sie fügt
ausschließlich den Enum, die neue Tabelle, Indizes und einen Fremdschlüssel hinzu.
Bestehende Daten werden nicht geändert oder gelöscht. Kein Reset und kein
erneutes Seeding sind nötig. Sollte Prisma Drift melden oder einen Reset
vorschlagen, abbrechen und die Ursache untersuchen.

### Neon / Produktion / Vercel

In einer vertrauenswürdigen Umgebung mit `DATABASE_URL` für Neon:

```bash
npx prisma migrate deploy
```

Für Migrationen möglichst die direkte Neon-Verbindung verwenden. Keine lokale
Entwicklungs-Migration und keinen Seed gegen Produktion ausführen.
Danach ist ein Vercel-Deploy des neuen Codes nötig. Der bestehende
`postinstall`-Schritt erzeugt den Prisma-Client; `prisma migrate deploy` wird
durch einen Vercel-Build nicht automatisch ausgeführt.
Die Migration muss vor Aktivierung des neuen Codes angewendet sein.

## Schichttausch

Unter `/schichttausch` stellen Mitarbeiter eigene Anfragen und beantworten
erhaltene Anfragen. Im eigenen Jahresplan ist „Schichttausch anfragen“ erreichbar;
ein Klick auf eine eigene zukünftige Arbeitsschicht übernimmt deren Datum.
Der Tauschpartner wird aus aktiven Mitarbeitern mit Name, Hauptbereich und
aktueller Tagesschicht ausgewählt. Die eigene Schicht wird aus der Planung
ermittelt und kann nicht durch den Browser vorgegeben werden.

Statusfolge: `ANGEFRAGT` → `PARTNER_BESTAETIGT` → `GENEHMIGT` oder `ABGELEHNT`.
Der Partner kann stattdessen `PARTNER_ABGELEHNT` wählen. Der Antragsteller kann
eine offene Anfrage (`ANGEFRAGT` oder `PARTNER_BESTAETIGT`) auf `STORNIERT` setzen.
Endzustände können nicht erneut freigegeben oder storniert werden.

### Konflikte und Freigabe

Folgende Konflikte blockieren die Anfrage und werden bei Partnerbestätigung
und Genehmigung erneut geprüft:

- Inaktiver Mitarbeiter, fehlende Arbeitsschicht oder freier Tag.
- Offener oder genehmigter Urlaub, jede erfasste Abwesenheit.
- Vorhandene manuelle `ShiftAssignment`-Einträge, einschließlich individueller
  Tagesplanung und bereits genehmigter Tausche.
- Nicht stornierter temporärer Einsatz an diesem Tag.
- Andere offene Anfrage für einen der beiden Mitarbeiter an demselben Tag.
- Identische Schichten, Tausch mit sich selbst oder ein vergangenes Datum.
- Bei späterer Freigabe: Schichten stimmen nicht mehr mit der Anfrage überein.

Partnerauswahl zeigt bei fremden Abwesenheiten nur einen allgemeinen
Planungskonflikt, keine medizinischen Details. Schreibaktionen werden
ausschließlich serverseitig autorisiert und geprüft.

Admin und Vorarbeiter bearbeiten Anfragen unter `/admin/schichttausch`.
Nach Auswahl eines Partners prüft das Anfrageformular bereits vor dem Absenden
Mindestbesetzung und Qualifikationsbesetzung mit derselben Berechnungslogik.
Mitarbeiter erhalten nur allgemeine Warnungen, keine fremden Personal- oder
Abwesenheitsdetails. Defizite blockieren die Anfrage nicht; bei einem Ladefehler
muss die Prüfung erfolgreich wiederholt werden, bevor die Anfrage gesendet wird.
„Besetzung prüfen“ zeigt vor der Freigabe die Auswirkungen je Bereich und
Schicht, einschließlich Mindest- und Qualifikationsbesetzung. Die vorhandene
Berechnungslogik bleibt unverändert; eine Unterbesetzung wird angezeigt, die
Freigabeentscheidung bleibt bei Admin/Vorarbeiter. Partnerzustimmung ist für
Freigabe und administrative Ablehnung erforderlich.

Erst `GENEHMIGT` schreibt beide getauschten Schichten als `ShiftAssignment`
mit Quelle `MANUAL` für genau das Antragsdatum. Bestehende Rotationszeilen dieses
Tages werden aktualisiert; fehlende Tageszeilen angelegt. Die Schichtmodelle,
Gruppen und Folgetage werden nicht verändert. Die Notiz verweist auf die
Tauschanfrage. Tages-, Wochen-, Jahresplan und Exporte lesen dieselben Overrides.
Die Personalbesetzung wird aus dem aktuellen Plan neu berechnet, ohne separate
Besetzungsdaten zu speichern. Jahres-/Tages-/Wochenansichten laden beim
Fensterfokus neu; der persönliche Jahresplan lädt nur eigene Daten, sofern kein
Teamplanrecht vorliegt. Abwesenheiten stammen dort nun aus der Datenbank statt
aus Beispiel-Abwesenheiten.

Statuswechsel, beide Tageszuweisungen, Benachrichtigungen und Audit-Log laufen
gemeinsam in einer serialisierbaren Transaktion. Gleichzeitige widersprüchliche
Anfragen oder Entscheidungen liefern einen verständlichen Konflikt statt eines
Teil-Tauschs. Alle sechs Aktionen werden als `shift_swap.request`, `.confirm`,
`.decline`, `.approve`, `.reject` und `.cancel` protokolliert.

### Datenbank und Rechte

`ShiftSwapRequest` speichert Antragsteller, Partner, Datum, ursprüngliche
Schichten, Bereichsnamen als Momentaufnahme, Status, Bemerkung,
Entscheidungszeitpunkte sowie den freigebenden/ablehnenden Benutzer.
Mitarbeiterrelationen verwenden `RESTRICT`, damit die Historie nicht durch das
Löschen eines Mitarbeiters verloren geht.

Migration: `20261002130000_shift_swaps`. Sie legt ausschließlich das Modell,
Status-Enum, Indizes und Integritätsprüfungen an, erweitert Benachrichtigungstypen
und ergänzt die beiden Rechte samt Rollenstandardwerten. Keine bestehenden
Planungsdaten werden gelöscht oder verändert. Bestehende Rechte und
Mitarbeiter-Overrides bleiben bestehen.

- `requestShiftSwap`: eigene Anfragen stellen, sehen und beantworten; Standard
  für Mitarbeiter, Vorarbeiter und Admin.
- `approveShiftSwap`: alle Tausche prüfen, genehmigen oder ablehnen; Standard
  für Admin und Vorarbeiter. Zusätzlich ist immer die passende Rolle erforderlich.

Eigene und administrative Listen sind getrennt. Adminrechte geben weiterhin
keinen Zugriff auf private Benachrichtigungen anderer Mitarbeiter.
Rolle, Rechte und Mitarbeiterzuordnung werden bei jeder authentifizierten Anfrage
aus der Datenbank aktualisiert. Kein Seed und kein Berechtigungs-Reset nötig.

Lokal: die oben genannten Prisma-Befehle verwenden. Die bereits enthaltene
Migration wird mit `npx prisma migrate dev` angewendet. Für Neon/Produktion
`npx prisma migrate deploy`, danach den neuen Code auf Vercel deployen.
Falls die vorherige Benachrichtigungsmigration noch fehlt, wird sie ebenfalls
in der richtigen Reihenfolge angewendet.

Gezielte Tests:

```bash
npx tsx --test lib/shift-swap-rules.test.ts lib/shift-swaps.test.ts lib/shift-swap-staffing.test.ts lib/shift-plan.test.ts lib/notification-messages.test.ts lib/notifications.test.ts app/schichtplan/rotation.test.ts
```

## Benutzerverwaltung und Passwörter

Admins (Rolle Admin plus Recht „Mitarbeiter bearbeiten“) legen unter
`/mitarbeiter` neue Mitarbeiter samt Benutzerkonto an. Anmeldename ist die
Personalnummer, die E-Mail ist optional. Das Startpasswort wird eingegeben oder
generiert. Es wird nur mit bcrypt gehasht gespeichert und ein generiertes
Passwort einmalig zum Kopieren angezeigt.

- Neue Konten und Konten nach „Passwort zurücksetzen“ erhalten
  `mustChangePassword = true`. Bis zur Änderung sind nur `/passwort-aendern`,
  Abmelden und die Auth-Endpunkte erreichbar (Proxy + serverseitige Prüfungen).
  APIs antworten mit 403.
- Unter `/profil` ändert jeder angemeldete Benutzer sein Passwort selbst. Dafür
  muss er das aktuelle Passwort eingeben.
- Passwortregeln: mindestens 8 Zeichen, Groß- und Kleinbuchstabe sowie eine
  Zahl. Sonderzeichen sind erlaubt.
- Jede Passwortänderung setzt `passwordChangedAt`. Ältere Sitzungen werden damit
  ungültig, z. B. nach einem Admin-Reset.
- Inaktive Mitarbeiter bzw. Konten können sich nicht anmelden.
- Audit-Log: `user.create`, `user.password_change`, `user.password_reset`, ohne
  Passwörter oder Hashes.

Migration: `20261009200000_user_password_management`. Sie ergänzt
`User.mustChangePassword` (Default `false`, damit Bestandskonten nicht zum
Wechsel gezwungen werden) und `User.passwordChangedAt` und macht
`User.email`/`Employee.email` optional. Es werden keine Daten gelöscht.
Lokal mit `npx prisma migrate deploy` bzw. `npx prisma migrate dev` anwenden,
für Neon `npx prisma migrate deploy` ausführen. Den Seed nicht erneut
ausführen, er überschreibt die Passwörter der Seed-Konten.

## Testbenutzer bereinigen

**Seed-Verhalten (`npx prisma db seed`)**

- Standard: Es werden nur Basisdaten angelegt (Rollen, Rechte, Schichtmodelle, Bereiche …). Das Admin-Konto MA-1001 wird nur angelegt, wenn es noch nicht existiert. Dafür ist `SEED_ADMIN_PASSWORD` nötig.
- Demo-Mitarbeiter MA-1002 bis MA-1005 samt Beispiel-Urlauben und -Abwesenheiten werden nur mit `SEED_DEMO_DATA="true"` angelegt. In Produktion nicht setzen.
- Vorhandene Mitarbeiter werden nie verändert: kein Passwort-Reset, kein Status- oder Stammdaten-Overwrite.
- Im Adminbereich gelöschte Mitarbeiter (Audit-Log `employee.delete`) werden nie wieder angelegt, auch nicht im Demo-Modus.

**Bestand prüfen (nur lesend)**

```bash
npm run db:employee-report
DATABASE_URL="<neon-url>" npm run db:employee-report   # Produktion
```

Der Report listet alle Mitarbeiter mit Empfehlung (GESCHÜTZT, NUR DEAKTIVIEREN, LÖSCHBAR …) und verknüpften Daten. Er verändert nichts.

**Im Adminbereich** (Mitarbeiter → Bearbeiten → „Mitarbeiter entfernen“, nur Admins)

1. **Deaktivieren** (empfohlen): Die Anmeldung wird sofort gesperrt, alle Daten bleiben erhalten, das Konto ist wieder aktivierbar.
2. **Endgültig löschen**: nur für deaktivierte Testmitarbeiter. Der Dialog zeigt, welche Daten entfernt werden und welche erhalten bleiben. Zur Bestätigung muss die Personalnummer eingetippt werden. Sind historische Daten vorhanden (Urlaube, Abwesenheiten, Einsätze, manuelle Schichten), ist zusätzlich eine eigene Bestätigung nötig.

In diesen Fällen ist Löschen gesperrt, und es bleibt nur das Deaktivieren:
- MA-1001
- das eigene Konto
- Admin-Konten
- aktive Mitarbeiter
- genehmigte Schichttausche
- Konten, die Urlaube, Abwesenheiten, Einsätze, Betriebstage oder Schichttausche für andere genehmigt bzw. erfasst haben

Audit-Log-Einträge bleiben immer erhalten.

## Leistungserfassung

Mitarbeiter erfassen unter `/leistung` ihre aktuelle Leistung. Die responsive Dashboard-Kachel „Leistung“ führt direkt zur bestehenden Erfassung und verwendet denselben Kachelstil wie Schichtplan und Urlaub.

Auch die Startseite `/` (`app/page.tsx`, „Deine Bereiche“) enthält die Kachel „Leistung“ im identischen Stil der vier bestehenden Kacheln. Sie ist für angemeldete Admins unabhängig vom Auswertungsrecht sichtbar und führt nach `/admin/leistung`; die Berechtigungsprüfung der Zielseite bleibt unverändert. Mitarbeiter sehen sie mit `recordPerformance` und verknüpftem Mitarbeiterkonto, Vorarbeiter entsprechend ihren Leistungsrechten. Ohne Anmeldung wird sie nicht angezeigt. Die Bereichsanzahl wird aus den sichtbaren Kacheln berechnet.

- **Mitarbeiteransicht:** ausschließlich Eingabe für den aktuellen, serverseitig ermittelten Schichttag; keine Eintragsliste, Historie, Sollwerte, Prozentwerte, Auswertung oder fremden Leistungsdaten. Historische Einträge und Sollwerte werden für diese Ansicht nicht geladen oder an das Formular übergeben.
- **Admin:** Die Kachel „Leistung“ im Admin-Dashboard führt bei vorhandenem Auswertungsrecht nach `/admin/leistung`. Auswertung, Sollwert-Pflege und Export bleiben mit ihren bestehenden Berechtigungen verfügbar.
- **Vorarbeiter:** Das persönliche Dashboard ist unter `/dashboard` verfügbar. Leistungslinks und -funktionen erscheinen nur gemäß den vorhandenen Rechten: Erfassung (`recordPerformance`), Auswertung (`viewPerformance`) und Sollwert-Pflege (`managePerformanceTargets`). Ohne Auswertungsrecht ist die Erfassungsansicht ebenfalls auf die Eingabe beschränkt.

- **Automatisch:** Datum, Mitarbeiter (aus dem Login) und Schicht (aus dem Schichtplan, inkl. genehmigter Schichttausche/Overrides).
- **Eingaben:** Bereich (Kommissionieren / Verpackung), Arbeitsplatz (K01–K03 bzw. VP1–VP3), Menge, Arbeitszeit (Stunden/Minuten), optionale Bemerkung.
- **Nachtschicht:** Erfassungen vor 06:00 Uhr zählen zur Nachtschicht des Vortags.
- **Keine Erfassung möglich** an freien Tagen, bei genehmigtem Urlaub oder bei eingetragener Abwesenheit.
- **Grenzen:** Pro Schicht sind mehrere Einträge möglich, zusammen höchstens 16 Stunden. Die bestehende Löschfunktion bleibt erhalten, wird aber nur in der Eintragsliste berechtigter Admins/Vorarbeiter angeboten und erlaubt weiterhin ausschließlich eigene Einträge desselben Schichttags.

Die Auswertung für Admins und Vorarbeiter liegt unter `/admin/leistung`:
- Filter nach Zeitraum (max. 93 Tage), Bereich und Schicht
- Summen und Menge pro Stunde nach Arbeitsplatz und nach Mitarbeiter
- Liste der Einzeleinträge
- Excel-Export mit den gleichen Filtern und den historischen Sollwerten (zusätzlich Exportberechtigung erforderlich)

**Rechte:**
- `recordPerformance` (alle Rollen)
- `viewPerformance` (Admin, Vorarbeiter)
- `managePerformanceTargets` (Admin/Vorarbeiter mit explizitem Recht; standardmäßig nur Admin)

Die Erfassungs- und Auswertungsrechte werden über die Migration `20261009230000_performance_entries` gesetzt. Das neue Pflege-Recht wird über `20261010080000_performance_workstations` ergänzt. Auch Admins benötigen ausdrücklich `managePerformanceTargets`; normale Mitarbeiter dürfen Sollwerte unabhängig von versehentlich vergebenen Verwaltungsrechten nicht ändern. Jeder Eintrag, jede Löschung und jede Sollwertänderung werden im Audit-Log festgehalten (`performance.create`, `performance.delete`, `performance.target.update`).

Die auswählbaren Arbeitsplätze sind in `lib/performance-rules.ts` (`performanceAreas`) definiert und als Stammdaten in `PerformanceWorkstation` gespeichert.

### Soll-Leistung und Zielerreichung

Unter `/admin/leistung/arbeitsplaetze` können entsprechend berechtigte Admins und Vorarbeiter die Soll-Stückzahlen pro Stunde für K01–K03 und VP1–VP3 eintragen und ändern. Der Link ist im Dashboard und im Leistungsmodul verfügbar. Sollwerte sind positive ganze Zahlen und werden ausschließlich aus der Datenbank gelesen, nicht im Anwendungscode festgelegt.

- **Soll wird mitgespeichert:** Jeder Eintrag speichert das zum Erfassungszeitpunkt gültige Soll (`PerformanceEntry.targetPerHour`). Eine spätere Änderung der Werte wirkt nur auf neue Einträge.
- **Ist Stück/Std.:** Menge / Arbeitszeit in Stunden.
- **Leistungsgrad %:** Ist Stück/Std. / Soll Stück/Std. × 100. Ist und Leistungsgrad werden auf eine Nachkommastelle gerundet; die Berechnung verwendet ungerundete Zwischenwerte.
- **Ohne Soll:** Die Erfassung bleibt möglich. Der Snapshot bleibt `null`; in berechtigten Auswertungen werden Soll und Leistungsgrad als „Nicht hinterlegt“ angezeigt, auch wenn später ein Sollwert gepflegt wird. Die reine Mitarbeiter-Erfassung zeigt keine Sollwert-Hinweise.
- **Summen:** Bei mehreren Arbeitsplätzen wird das Soll nach Arbeitszeit gewichtet. Der zusammengefasste Leistungsgrad berücksichtigt ausschließlich Einträge mit gespeichertem Soll; Stückzahl und Arbeitszeit enthalten weiterhin alle Einträge.
- **Anzeige und Excel:** Die Admin-/Vorarbeiter-Leistungsübersicht und die eigene Eintragsliste bei vorhandenem Auswertungsrecht zeigen Soll Stück/Std., Ist Stück/Std. und Leistungsgrad %. Mitarbeiter sehen diese Angaben nicht. Der Excel-Export unter `/api/export/excel?type=performance` enthält diese Spalten als Zahlen (fehlendes Soll als Text). Dafür sind `viewPerformance` mit Admin-/Vorarbeiterrolle und eine bestehende Exportberechtigung (`exportReports` oder `viewReports`) nötig.
- **Farben:** grün ab 100 %, gelb ab 85 %, darunter rot.

Die bereits vorhandene Migration `20261009235000_performance_targets` fügt die Snapshot-Spalte hinzu und trägt die damaligen Startwerte bei bestehenden Einträgen nach. Diese Migration bleibt unverändert. Die neue, additive Migration `20261010080000_performance_workstations` legt die sechs Stammdatensätze und das Pflege-Recht an. Als Startwert wird je Arbeitsplatz der jüngste vorhandene Nicht-Null-Snapshot übernommen; ohne bisherigen Snapshot bleibt der Sollwert leer. Die neue Migration verändert oder löscht keine bestehenden Leistungseinträge.

**Lokal anwenden** (Prisma CLI lädt `.env.local` nicht automatisch):

```bash
DOTENV_CONFIG_PATH=.env.local node -r dotenv/config node_modules/prisma/build/index.js migrate deploy
npm run db:generate
```

Danach einen laufenden Entwicklungsserver neu starten und die Sollwerte prüfen bzw. unter `/admin/leistung/arbeitsplaetze` pflegen. Kein `prisma migrate reset` verwenden. Bei einer Umgebung mit bereits gesetzter `DATABASE_URL` genügt `npm run db:deploy` statt des ersten Befehls.

**Gezielt testen:**

```bash
npx tsx --test lib/performance-rules.test.ts lib/export/performance-excel.test.ts app/leistung/performance-form.test.tsx app/dashboard/personal-dashboard.test.tsx
DOTENV_CONFIG_PATH=.env.local PERFORMANCE_DB_TESTS=1 node -r dotenv/config node_modules/tsx/dist/cli.mjs --test lib/performance.integration.test.ts
```

Der Integrationstest ist standardmäßig deaktiviert und erlaubt nur eine lokale PostgreSQL-Verbindung. Er verwendet ein eigenes temporäres Schema, prüft Migration, Snapshot-Erhaltung, Pflege- und Exportrechte und entfernt ausschließlich dieses Testschema anschließend wieder.

## Serverseitige Benutzertrennung

- `lib/access-policy.ts` begrenzt Rechte nach Rolle. Normale Mitarbeiter können ausschließlich eigene Funktionen nutzen, auch bei versehentlich gesetzten Team-/Verwaltungsrechten. Konten- und Stammdatenänderungen bleiben Admins mit `editEmployees` vorbehalten.
- Authentifizierung und `getAuthorizationContext` lösen User, aktuelle Employee-Zuordnung und effektive Rechte aus der Datenbank auf. Änderungen an Rolle, Rechten oder Zuordnung wirken auf bereits bestehende Sitzungen; deaktivierte Konten und alte Sitzungen nach Passwortwechsel verlieren ihren Zugriff.
- Adminseiten prüfen ihre Funktionsrechte zusätzlich serverseitig über `requirePageAccess` beziehungsweise ihre vorhandenen Leistungs-/Tauschprüfungen. Das Ausblenden von Links ersetzt keine Zugriffskontrolle.
- „Mein Urlaub“ verwendet den angemeldeten Mitarbeiter statt einer Demo-ID. Leistungs-, Urlaubs-, Planungs-, Benachrichtigungs- und Passwortaktionen beziehen ihre eigene Mitarbeiter-/Benutzer-ID niemals aus Browserfeldern.
- Die normalen Mitarbeiterlisten und Kontoaktionen bleiben getrennt von Fachansichten. `GET /api/employees?scope=vacation|qualifications|assignments|export` benötigt das jeweilige Fachrecht und liefert nur die benötigten Namen/Planungsdaten: keine Kontaktinformationen, Personalnummern, Kontoinformationen oder individuellen Rechte. Qualifikationsdaten werden nur für Qualifikation/Einsatzplanung mitgeliefert.
- Die Einsatzplanung liest Verfügbarkeit über einen separat autorisierten Planungsscope; fremde Urlaubskommentare und konkrete Abwesenheitsarten werden dort nicht mitgeliefert.
- Schichttausch erlaubt weiterhin die erforderliche minimale Partnerliste (Name, Bereich, Schicht). Unbeteiligte Anfragen bleiben privat. Auch Fehlerantworten geben ohne passende Urlaubs-/Abwesenheitsrechte nur einen allgemeinen Planungskonflikt zurück.
- Produktive Ansichten und Repositories verwenden keine Demo-Mitarbeiter, Demo-Abwesenheiten oder unautorisierten localStorage-Fallbacks. API-Fehler werden angezeigt; fehlgeschlagene Schreibaktionen werden nicht als lokal erfolgreich ausgegeben. Beispieldefinitionen bleiben ausschließlich für Seeds/Tests erhalten.
- Mitarbeiter-Leistung bleibt eine reine aktuelle Erfassung ohne Historie, Sollwerte oder Prozentwerte. Admin-/Vorarbeiterauswertungen und Exporte benötigen die jeweiligen Rechte. Eigener Jahresplan-Export ist weiterhin mit eigenem Planrecht möglich, aber niemals für eine fremde Employee-ID.

Die Benutzertrennung ändert kein Prisma-Modell und benötigt keine neue Migration. Bestehende Daten, IDs und gespeicherte Rechte werden nicht gelöscht oder umgeschrieben; nicht rollengerechte Rechte werden lediglich bei der Autorisierung unwirksam.

### Reproduzierbare Trennungstests

```bash
npm run build
npx tsx --test lib/*.test.ts lib/export/*.test.ts app/dashboard/personal-dashboard.test.tsx app/leistung/performance-form.test.tsx app/schichtplan/rotation.test.ts
DOTENV_CONFIG_PATH=.env.local ISOLATION_DB_TESTS=1 node -r dotenv/config node_modules/tsx/dist/cli.mjs --test lib/employee-isolation.integration.test.ts
```

Der HTTP-Integrationstest legt in einem zufälligen temporären PostgreSQL-Schema zwei unterschiedliche Mitarbeiterkonten A/B sowie Admin und Vorarbeiter an. Er meldet sie mit echten Credentials an einem separaten lokalen Next-Server an und prüft eigene Daten, manipulierte IDs, direkte Admin-URLs, Excel-Inhalte, Tausch-Fehlerantworten, echte Leistungs-/Sollwert-/Passwort-Server-Actions sowie sofortigen Rechteentzug, Rollenwechsel und geänderte Employee-Zuordnung. Die Mitarbeiterrolle erhält dabei absichtlich auch unzulässige Verwaltungsflags, um die Rollenbegrenzung zu überprüfen. Ohne `ISOLATION_DB_TESTS=1` ist dieser Test deaktiviert; nicht lokale Datenbanken werden abgewiesen. Anschließend werden nur Testserver und eigenes Testschema entfernt, keine Konten in der normalen App-Datenbank angelegt.

## Zusatzschichten / Wochenendarbeit

Unter `/admin/zusatzschichten` planen Admins und Vorarbeiter einzelne Samstags- und Sonntagsdienste für einen oder mehrere Mitarbeiter. Datum, Früh/Spät/Nacht und Zielbereich sind erforderlich; eine Bemerkung ist optional. Mehrfachauswahlen werden atomar gespeichert: bei einem blockierenden Konflikt wird kein Mitarbeiter der Auswahl eingeplant.

### Speicherung, Status und Rechte

`AdditionalShift` speichert jeden Mitarbeiterdienst separat mit Datum, Schicht, Bereich, Bemerkung, Status, Ersteller, Freigeber und Zeitstempeln. Es werden keine Rotations- oder manuellen `ShiftAssignment`-Zeilen erzeugt.

- `ENTWURF`: für die Planung reserviert, aber nicht im verbindlichen Mitarbeiterplan oder in der Besetzung.
- `FREIGEGEBEN`: im persönlichen Schichtplan ausdrücklich als **Zusatzschicht**, im Dashboard und in der Personalbesetzung berücksichtigt.
- `STORNIERT`: bleibt mit Historie gespeichert, wird nicht mehr im verbindlichen Plan gezählt. Eine neue Planung für denselben Tag ist danach möglich; stornierte Einträge werden nicht reaktiviert.

Neue Rechte: `viewAdditionalShifts`, `planAdditionalShifts`, `releaseAdditionalShifts`, `cancelAdditionalShifts`. Die additive Migration setzt Standardrechte für vorhandene Admin-/Vorarbeiterrollen, nicht für Mitarbeiter. Bestehende Einzelrechte werden nicht überschrieben. Seite und API autorisieren serverseitig; die Rolle muss Admin/Vorarbeiter sein. Änderungen bereits freigegebener Einträge benötigen zusätzlich zum Planungsrecht das Freigaberecht. Mitarbeiter sehen nur eigene freigegebene Einträge über ihre bestehenden Planrechte.

### Schichtzeiten und Konflikte

Vereinbarte Zeiten in **Europe/Berlin**: Früh 06–14 Uhr, Spät 14–22 Uhr, Nacht 22–06 Uhr des Folgetags. Eine Samstag-Nachtschicht gehört zum Samstag, auch wenn sie Sonntagmorgen endet. Der Herbst-/Frühjahrszeitwechsel wird über die tatsächlichen Berliner Zeitpunkte berücksichtigt (Nachtdienst gegebenenfalls neun beziehungsweise sieben statt acht tatsächliche Stunden). Die bestehende Leistungserfassung ordnet Arbeit vor 06 Uhr weiterhin der Nachtschicht des Vortags zu.

Bei Erstellung, Änderung und erneut bei Freigabe werden geprüft:

- aktiver Mitarbeiter und aktiver Zielbereich;
- offener/genehmigter Urlaub sowie Krankheit/Abwesenheit; bei Nacht auch der Folgetag;
- bestehende normale Schicht, individuelle Zuordnung/ShiftOverride;
- andere nicht stornierte Zusatzschicht, temporärer Einsatz und offener/genehmigter Schichttausch;
- Überschneidungen der Schichtintervalle, einschließlich benachbarter Kalendertage;
- Qualifikationsanforderung des Zielbereichs für die ausgewählte Schicht über die vorhandene Mindestbesetzungslogik.

Planungskonflikte blockieren. Fehlende/eingeschränkte Qualifikation erscheint wie vereinbart als **Warnung**, eine berechtigte Freigabe bleibt möglich. Diese Prüfung ist keine zusätzliche arbeitsrechtliche Ruhezeitenprüfung; sie verhindert Doppelbelegungen und die genannten Planungskonflikte.

Serializable-Transaktionen und ein partieller eindeutiger Datenbankindex verhindern parallele Doppelplanung. Pro Mitarbeiter und Startdatum ist höchstens ein nicht stornierter Zusatzdienst möglich. Änderungen benötigen den aktuellen `updatedAt`-Wert. Neue Urlaubs-/Einsatz-/Overrideplanungen dürfen vorhandene Zusatzschichten ebenfalls nicht nachträglich überlagern; Zusatzschichten werden nicht über den normalen Schichttausch geändert.

### Besetzung, Mitteilungen und Historie

Die bestehende Tages-/Wochenlogik bleibt bestehen; ihre sieben Wochentage enthalten weiterhin Samstag und Sonntag. Der freigegebene Einzel-Dienst ergänzt nur sein Startdatum und zählt im **gewählten Zielbereich**, inklusive der vorhandenen Qualifikationsbesetzung. Folgetage und Wochenrotation bleiben unverändert. Wochen-/Jahres-Excel und Druckansichten verwenden denselben Plan und kennzeichnen Zusatzschichten; die kompakte Jahresansicht verwendet eine Markierung mit Details in der Zellnotiz.

Freigabe, Änderung einer freigegebenen Schicht und Stornierung einer freigegebenen Schicht erzeugen persönliche Benachrichtigungen. Entwürfe lösen noch keine verbindliche Mitarbeiter-Mitteilung aus. Audit-Aktionen `additional_shift.create`, `.update`, `.release`, `.cancel` enthalten Mitarbeiter, Datum, Schicht, Bereich, Status, ausführenden Benutzer und Audit-Zeitpunkt. Zusatzschichthistorie verhindert eine endgültige Mitarbeiterlöschung; Deaktivierung bleibt möglich.

### Migration und lokale Befehle

Migration: `20261010110000_additional_shifts`. Sie ergänzt Modell, Status, Benachrichtigungstypen, Indizes, Constraints und Rechte. Keine bestehenden Leistungs-/Schicht-/Mitarbeiterdaten werden gelöscht oder umgeschrieben. Kein Reset und kein Seed nötig.

```bash
DOTENV_CONFIG_PATH=.env.local node -r dotenv/config node_modules/prisma/build/index.js migrate deploy
npm run db:generate
npm run build
```

Danach den lokalen Server neu starten. **Diese Migration erst beim geplanten Produktionswechsel auf Neon anwenden** (`npm run db:deploy` mit der dortigen `DATABASE_URL`) und anschließend die passende Anwendungsversion bereitstellen. Das Erstellen und lokale Testen dieser Funktion führt keinen Neon-/Vercel-Deploy aus.

Tests:

```bash
npx tsx --test lib/additional-shifts.test.ts
DOTENV_CONFIG_PATH=.env.local ADDITIONAL_SHIFT_DB_TESTS=1 node -r dotenv/config node_modules/tsx/dist/cli.mjs --test lib/additional-shifts.integration.test.ts
DOTENV_CONFIG_PATH=.env.local ISOLATION_DB_TESTS=1 node -r dotenv/config node_modules/tsx/dist/cli.mjs --test lib/employee-isolation.integration.test.ts
```

Der Zusatzschichttest nutzt nur ein temporäres lokales Schema und prüft Migrationserhaltung, alle sechs Samstag-/Sonntagsschichten, Konflikte, Nacht-Folgetag, Qualifikationswarnung, Freigabe, Änderung, Benachrichtigungen, Stornierung, Audit, Mehrfachauswahl und parallele Doppelplanung. Der HTTP-Trennungstest prüft zusätzlich echte API-Aufrufe, entzogenes Freigaberecht und eigene Kalender-/Dashboardanzeige. Beide entfernen ausschließlich ihre eigenen Testschemas.
