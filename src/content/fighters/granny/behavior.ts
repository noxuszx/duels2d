import type { BehaviorHandlers } from "../../../gameplay/fighter-factory";
import type { Targeting } from "../../../gameplay/components/targeting";
import type { MeleeAttack } from "../../../gameplay/components/melee";
import type { ProjectileEmitter } from "../../../gameplay/components/projectile";
import type { SpriteAim } from "../../../gameplay/components/aim";
import type { Forms } from "../../../gameplay/components/forms";
import type { Visuals } from "../../../gameplay/components/visuals";

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
                              for (const step of transformed.sequence ?? [])
                                    yield visuals.pose(transformed.poses![step.pose], step.durationMs);
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
                              yield* aim.follow(target, function* () {
                                    yield visuals.pose("attackWindup", blast.windupMs ?? 0);
                                    yield shotgun.start(target);
                                    yield visuals.pose("attackActive", blast.attackDurationMs ?? 0);
                                    yield visuals.pose("recovery", blast.recoveryMs ?? 0);
                              });
                        },
                  },
            },
      };
}
