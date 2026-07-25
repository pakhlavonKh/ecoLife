/**
 * Shared holder for the live bot username (from getMe), used for invite deep links.
 */
let cachedBotUsername: string | null = null;

export function setTelegramBotUsername(username: string | null | undefined): void {
  const trimmed = (username ?? '').trim().replace(/^@/, '');
  cachedBotUsername = trimmed || null;
}

export function getTelegramBotUsername(): string | null {
  return cachedBotUsername;
}
