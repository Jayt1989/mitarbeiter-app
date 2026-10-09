export const passwordMinLength = 8;
// bcrypt berücksichtigt nur die ersten 72 Bytes; längere Passwörter würden stillschweigend gekürzt.
export const passwordMaxBytes = 72;

export const passwordRulesText =
  "Mindestens 8 Zeichen, mit Groß- und Kleinbuchstaben sowie mindestens einer Zahl. Sonderzeichen sind erlaubt.";

export function passwordPolicyErrors(password: string): string[] {
  const errors: string[] = [];
  if (password.length < passwordMinLength) {
    errors.push(`Das Passwort muss mindestens ${passwordMinLength} Zeichen lang sein.`);
  }
  if (new TextEncoder().encode(password).length > passwordMaxBytes) {
    errors.push("Das Passwort ist zu lang (maximal 72 Zeichen).");
  }
  if (!/\p{Lu}/u.test(password)) errors.push("Das Passwort muss mindestens einen Großbuchstaben enthalten.");
  if (!/\p{Ll}/u.test(password)) errors.push("Das Passwort muss mindestens einen Kleinbuchstaben enthalten.");
  if (!/\d/.test(password)) errors.push("Das Passwort muss mindestens eine Zahl enthalten.");
  if (/^\s|\s$/.test(password)) errors.push("Das Passwort darf nicht mit einem Leerzeichen beginnen oder enden.");
  return errors;
}

export function validateNewPassword(password: string, confirmation: string): string[] {
  const errors = passwordPolicyErrors(password);
  if (password !== confirmation) errors.push("Die beiden Passwörter stimmen nicht überein.");
  return errors;
}

const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const lower = "abcdefghijkmnopqrstuvwxyz";
const digits = "23456789";
const symbols = "!#$%*+-?";

function randomIndex(max: number) {
  const values = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  do crypto.getRandomValues(values); while (values[0] >= limit);
  return values[0] % max;
}

/** Erzeugt ein zufälliges Startpasswort (ohne verwechselbare Zeichen wie 0/O, 1/l). */
export function generateStartPassword(length = 12): string {
  const all = upper + lower + digits + symbols;
  const chars = [upper, lower, digits, symbols].map((set) => set[randomIndex(set.length)]);
  while (chars.length < length) chars.push(all[randomIndex(all.length)]);
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1);
    [chars[index], chars[swap]] = [chars[swap], chars[index]];
  }
  return chars.join("");
}
