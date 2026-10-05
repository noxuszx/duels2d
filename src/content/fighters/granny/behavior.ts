import type { BehaviorHandlers } from "../../../gameplay/fighter-factory";
import type { Targeting } from "../../../gameplay/components/targeting";
import type { MeleeAttack } from "../../../gameplay/components/melee";
import type { ProjectileEmitter } from "../../../gameplay/components/projectile";
import type { SpriteAim } from "../../../gameplay/components/aim";
import type { Forms } from "../../../gameplay/components/forms";
import type { Visuals } from "../../../gameplay/components/visuals";
import { scoped } from "../../../engine/scripting/scoped";
import { poseSequence } from "../../script-helpers/pose-sequence";

interface GrannyComponents {
      targeting: Targeting; melee: MeleeAttack; shotgun: ProjectileEmitter;
      aim: SpriteAim; forms: Forms; visuals: Visuals;
}

/** Granny chooses the sequence; equipped mechanics own its execution and cleanup. */
export function grannyBehavior({ targeting, melee, shotgun, aim, forms, visuals }: GrannyComponents): BehaviorHandlers {
      const strike = forms.baseMove("rolling-pin-strike");
      const transformed = forms.settings("transformed");
      const blast = transformed.moves["shotgun-blast"];
      return {
            actions: {
                  transformation: {
                        interrupt: true,
                        when: () => !forms.is("transformed") && forms.healthRatio <= transformed.healthRatio!,
                        *run() {
                              yield* poseSequence(visuals, transformed.poses!, transformed.sequence ?? []);
                              forms.enter("transformed");
                        },
                  },
                  "rolling-pin-strike": {
                        when: () => {
                              const target = targeting.nearestEnemy();
                              return !forms.is("transformed") && !!target && melee.inRange(target, strike.rangePadding);
                        },
                        *run() {
                              const target = targeting.nearestEnemy();
                              if (!target) return;
                              yield visuals.pose("attackWindup", strike.windupMs ?? 0);
                              yield melee.start(target, strike.attackDurationMs ?? 0);
                              yield visuals.pose("idle", strike.recoveryMs ?? 0);
                        },
                  },
                  "shotgun-blast": {
                        when: () => forms.is("transformed") && !!targeting.nearestEnemy(),
                        *run() {
                              const target = targeting.nearestEnemy();
                              if (!target) return;
                              yield* scoped(() => aim.track(target), function* () {
                                    yield visuals.pose("attackWindup", blast.windupMs ?? 0);
                                    const solution = aim.current;
                                    if (!solution) return;
                                    yield shotgun.emit({ position: solution.origin, direction: solution.direction });
                                    yield visuals.pose("attackActive", blast.attackDurationMs ?? 0);
                                    yield visuals.pose("recovery", blast.recoveryMs ?? 0);
                              });
                        },
                  },
            },
      };
}
