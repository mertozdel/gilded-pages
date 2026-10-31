import { bus } from '../bus/events';
import type { RoomId } from '../content/rooms';

let lastClaim = 0;

/**
 * A screen's claim on the world's one room view (a RoomView, the select screen's line-up).
 * Each report carries the claim, and letting go only takes the room away if no other screen
 * has claimed it since: going from one screen to the next, the new screen reports its room
 * before the old one unmounts, and the old one's goodbye must not clear the new room.
 */
export function newRoomClaim(): number {
  return ++lastClaim;
}

export function reportRoom(claim: number, room: RoomId | null, rect: { x: number; y: number; width: number; height: number } | null): void {
  bus.emit('room:layout', { room, rect, claim });
}

/** Lets go of `room` (the one this claim reported), if it's still what the world shows for it. */
export function releaseRoom(claim: number, room: RoomId | null): void {
  const last = bus.last('room:layout');
  if (last?.claim === claim && last.room === room) bus.emit('room:layout', { room: null, rect: null, claim });
}
