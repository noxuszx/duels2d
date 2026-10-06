import { defineFighter } from "../../../gameplay/fighter-factory";
import { ProjectileEmitter, Targeting, Visuals } from "../../../gameplay/components";
import type { ProjectileEmitterSettings } from "../../../config/component-settings";
import { depressedManBehavior } from "./behavior";

export const depressedMan = defineFighter({
      id: "depressedman",
      components: {
            targeting: context => new Targeting(context, context.config.faceTarget),
            visuals: context => new Visuals(context),
            tear: context => {
                  const settings = context.config.components.projectile;
                  if (!settings) throw new Error("Depressed Man requires projectile settings");
                  return new ProjectileEmitter(context, settings);
            },
            miniTear: context => {
                  const base = context.config.components.projectile;
                  if (!base) throw new Error("Depressed Man requires projectile settings");
                  const miniSettings: ProjectileEmitterSettings = {
                        projectile: {
                              ...base.projectile,
                              radius: Math.max(5, Math.round(base.projectile.radius * 0.5)),
                              speed: base.projectile.speed * 1.4,
                              damage: Math.max(1, Math.round(base.projectile.damage * 0.4)),
                              image: base.projectile.image,
                              imageScales: typeof base.projectile.image === "string"
                                    ? { [base.projectile.image]: 0.5 }
                                    : undefined,
                              flight: {
                                    collision: {
                                          response: "sensor",
                                          enemyContact: "consume",
                                          ownerContact: "ignore",
                                          walls: "bounce",
                                    },
                                    lifetime: {
                                          type: "duration",
                                          durationMs: 1500,
                                    },
                                    ownership: {
                                          onOwnerDeath: "persist",
                                          onOwnerRemoval: "persist",
                                          onMatchEnd: "remove",
                                    },
                              },
                        },
                        sound: base.sound,
                        hitSound: base.hitSound,
                  };
                  return new ProjectileEmitter(context, miniSettings);
            },
      },
      tasks: {},
      behavior: depressedManBehavior,
});
