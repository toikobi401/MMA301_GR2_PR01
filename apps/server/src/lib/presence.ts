/**
 * Who has a socket open right now.
 *
 * In memory, like the rest of the live game: there is one server process, and
 * a restart correctly leaves nobody online until their client reconnects.
 */
const sockets = new Map<string, number>();

export function socketOpened(userId: string): void {
  sockets.set(userId, (sockets.get(userId) ?? 0) + 1);
}

export function socketClosed(userId: string): void {
  const remaining = (sockets.get(userId) ?? 0) - 1;
  if (remaining > 0) sockets.set(userId, remaining);
  else sockets.delete(userId);
}

export function isOnline(userId: string): boolean {
  return sockets.has(userId);
}
