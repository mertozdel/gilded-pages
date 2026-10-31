import { describe, expect, it } from 'vitest';
import { bus } from '../../src/bus/events';
import { newRoomClaim, releaseRoom, reportRoom } from '../../src/ui/roomClaim';

const rect = { x: 0, y: 0, width: 390, height: 600 };

describe('room claims (switching character never leaves the world without a room)', () => {
  it("the old screen's goodbye doesn't clear the room the new screen just asked for", () => {
    const select = newRoomClaim();
    reportRoom(select, 'cafe-select', rect);
    // The café mounts and reports before the select screen unmounts…
    const cafe = newRoomClaim();
    reportRoom(cafe, 'cafe', rect);
    releaseRoom(select, 'cafe-select');
    // …so the café stays.
    expect(bus.last('room:layout')?.room).toBe('cafe');
  });

  it('leaving with nothing after takes the room away', () => {
    const cafe = newRoomClaim();
    reportRoom(cafe, 'cafe', rect);
    releaseRoom(cafe, 'cafe');
    expect(bus.last('room:layout')?.room).toBeNull();
  });

  it('a screen that changed room in place only lets go of its old one', () => {
    const a = newRoomClaim();
    reportRoom(a, 'cafe', rect);
    reportRoom(a, 'cafe-iso', rect);
    releaseRoom(a, 'cafe');
    expect(bus.last('room:layout')?.room).toBe('cafe-iso');
  });
});
