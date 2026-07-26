/** Join first/last for display (skip empty / duplicate surname). */
export function formatGuestName(firstName: string, lastName: string): string {
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  if (!last || last === first) {
    return first;
  }
  return `${first} ${last}`;
}

/**
 * Split a single "Гость" input into API firstName / lastName.
 * First word → firstName, remainder → lastName (may be empty).
 */
export function splitGuestName(full: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = full.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return { firstName: '', lastName: '' };
  }
  const space = trimmed.indexOf(' ');
  if (space === -1) {
    return { firstName: trimmed, lastName: '' };
  }
  return {
    firstName: trimmed.slice(0, space),
    lastName: trimmed.slice(space + 1),
  };
}
