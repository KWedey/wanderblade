// Where a held strike lands. Separated from the view because the answer is a
// rule, not a DOM detail: a thumb that slides onto a different coin has aimed
// at it, and aim is what decides the catch.

export type Aim = { x: number; y: number } | null;

export interface HeldAim {
  /** A pointer hold passes its point; a keyboard hold passes null. */
  begin(aim: Aim): void;
  /** The pointer moved. Ignored unless a pointer hold is running. */
  moved(x: number, y: number): void;
  end(): void;
  held(): boolean;
  /** Where the next repeat should land. Null means "let the scene auto-aim". */
  target(): Aim;
}

export function createHeldAim(): HeldAim {
  let running = false;
  let pointer = false;
  let at: Aim = null;

  return {
    begin(aim) {
      running = true;
      // A keyboard hold has no pointer, and a mouse drifting across the window
      // must not start aiming for it.
      pointer = aim !== null;
      at = aim;
    },
    moved(x, y) {
      if (!running || !pointer) return;
      at = { x, y };
    },
    end() {
      running = false;
      pointer = false;
      at = null;
    },
    held: () => running,
    target: () => at,
  };
}
