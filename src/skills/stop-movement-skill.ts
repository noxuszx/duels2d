import type { GameplayOperation } from "../gameplay/action-scope";
import type { FighterMovement } from "../gameplay/movement";

/** Stops once and leases voluntary cruise control; external forces remain active. */
export class StopMovementSkill implements GameplayOperation {
      private readonly release: () => void;

      constructor(movement: FighterMovement) {
            movement.stop();
            this.release = movement.suspendCruise();
      }

      update(): void {}
      cancel(): void { this.release(); }
}
