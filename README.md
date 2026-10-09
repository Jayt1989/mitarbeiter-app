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
Nach der Migration einmal ab- und wieder anmelden, damit die neuen Rechte auch
im Sitzungstoken stehen. Kein Seed und kein Berechtigungs-Reset nötig.

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
