// Persistent, reconnect-safe player identity stored in localStorage.

const PID_KEY = 'whereto.playerId';
const NAME_KEY = 'whereto.playerName';
const ROOM_KEY = 'whereto.lastRoom';

function uid(): string {
  // crypto.randomUUID is available on iOS Safari 15.4+.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getPlayerId(): string {
  let id = localStorage.getItem(PID_KEY);
  if (!id) {
    id = uid();
    localStorage.setItem(PID_KEY, id);
  }
  return id;
}

export function getStoredName(): string {
  return localStorage.getItem(NAME_KEY) ?? '';
}
export function setStoredName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}

export function getLastRoom(): string {
  return localStorage.getItem(ROOM_KEY) ?? '';
}
export function setLastRoom(code: string): void {
  localStorage.setItem(ROOM_KEY, code);
}
export function clearLastRoom(): void {
  localStorage.removeItem(ROOM_KEY);
}
