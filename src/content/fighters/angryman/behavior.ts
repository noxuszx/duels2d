import type { BehaviorHandlers, FighterContext } from "../../../gameplay/fighter-factory";
import type { Targeting } from "../../../gameplay/components/targeting";
import type { Dasher } from "../../../gameplay/components/dash";
import type { Visuals } from "../../../gameplay/components/visuals";
import { scoped } from "../../../engine/scripting/scoped";
import { all } from "../../../engine/scripting/all";
import { race } from "../../../engine/scripting/race";
import { wait } from "../../../engine/scripting/wait";
import { pauseMovement } from "../../script-helpers/pause-movement";
import { shake } from "../../script-helpers/shake";

interface AngryManComponents {
      targeting: Targeting; visuals: Visuals; dash: Dasher;
}

/** Stop, shake, charge, recover. Mechanics own execution; this script owns the sequence. */
export function angryManBehavior({ targeting, visuals, dash }: AngryManComponents,
      { entity, config }: FighterContext): BehaviorHandlers {
      const charge = config.moves.charge;
      return { actions: {
            charge: {
                  when: () => !!targeting.nearestEnemy(),
                  *run() {
                        const target = targeting.nearestEnemy();
                        if (!target) return;
                        yield* scoped(() => pauseMovement(entity), function* () {
                              yield all(
                                    visuals.pose("attackWindup", charge.windupMs ?? 0, charge.windupSound),
                                    shake(entity, charge.windupMs ?? 0),
                              );
                        });
                        const currentTarget = target.isAlive ? target : targeting.nearestEnemy();
                        if (currentTarget) yield race(
                              dash.start(currentTarget),
                              wait(charge.attackDurationMs ?? config.components.dash!.maxDurationMs),
                        );
                        yield visuals.pose("idle", charge.recoveryMs ?? 0);
                  },
            },
      } };
}
