/** Join first/last without duplicating when surname is empty or identical. */
export function formatGuestName(firstName: string, lastName: string): string {
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  if (!last || last === first) {
    return first;
  }
  return `${first} ${last}`;
}
