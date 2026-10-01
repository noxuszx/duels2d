import type { Fighter } from "../entities/fighter";
import type { DashAction } from "../abilities/types";
import { DashSkill } from "../skills/dash-skill";
import type { ActionScope } from "./action-scope";
import type { AbilityRunner } from "./ability-runner";

/** Binds the reusable dash lifecycle to an active ability phase. */
export function dashToward(
      scope: ActionScope,
      move: AbilityRunner,
      target: Fighter,
      settings: DashAction,
      onHit: (enemy: Fighter) => void,
): void {
      if (!move.ownsActiveScope(scope)) return;
      if (!move.validTarget(target)) return move.finishActive();
      const dash = scope.use(new DashSkill());
      const started = dash.startToward(move.owner, target, {
            speedMultiplier: settings.speedMultiplier,
            accelerationForce: settings.accelerationForce,
            stopOn: settings.endOn,
            maxDurationMs: move.remainingMs,
            onHitEnemy: (enemy) => { if (move.validTarget(enemy)) onHit(enemy); },
            onComplete: () => { if (move.ownsActiveScope(scope)) move.finishActive(); },
      });
      if (!started) move.finishActive();
}
