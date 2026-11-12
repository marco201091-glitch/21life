export type ParticipantKey = `user:${string}` | `guest:${string}`;

export function toUserParticipantKey(userId: string): ParticipantKey {
  return `user:${userId}`;
}

export function toGuestParticipantKey(guestId: string): ParticipantKey {
  return `guest:${guestId}`;
}

export function normalizeGuestName(name: string) {
  return name.trim().toLowerCase();
}

export function parseParticipantKey(key: string): { type: 'user' | 'guest'; id: string } | null {
  if (key.startsWith('user:')) {
    const id = key.slice(5);
    return id ? { type: 'user', id } : null;
  }
  if (key.startsWith('guest:')) {
    const id = key.slice(6);
    return id ? { type: 'guest', id } : null;
  }
  return null;
}