import type { BehaviorHandlers } from "../../../gameplay/fighter-factory";
import type { Forms, MeleeAttack, ProjectileEmitter, SpriteAim, Targeting, Visuals } from "../../../gameplay/components";
import { scoped } from "../../../engine/scripting";
import { poseSequence } from "../../script-helpers";

interface GrannyComponents {
      targeting: Targeting; melee: MeleeAttack; shotgun: ProjectileEmitter;
      aim: SpriteAim; forms: Forms; visuals: Visuals;
}

/** Length of the shotgunShoot clip; the reload cue starts as soon as it ends. */
const SHOT_CLIP_MS = 970;

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
                              yield* poseSequence(visuals, transformed.poses!, transformed.sequence ?? [], "transform");
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
                                    const recoveryMs = blast.recoveryMs ?? 0;
                                    yield visuals.pose("recovery", recoveryMs);
                                    const gapMs = Math.max(0, SHOT_CLIP_MS - (blast.attackDurationMs ?? 0) - recoveryMs);
                                    if (gapMs) yield visuals.pose("idle", gapMs);
                                    yield visuals.pose("idle", 50, "shotgunReload");
                              });
                        },
                  },
            },
      };
}
