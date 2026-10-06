import { defineFighter } from "../../../gameplay/fighter-factory";
import { Forms, MeleeAttack, ProjectileEmitter, SpriteAim, Targeting, Visuals } from "../../../gameplay/components";
import { grannyBehavior } from "./behavior";

export const granny = defineFighter({
      id: "granny",
      components: {
            targeting: context => new Targeting(context, context.config.faceTarget),
            forms: context => new Forms(context),
            visuals: context => new Visuals(context),
            melee: context => {
                  const settings = context.config.components.melee;
                  if (!settings) throw new Error("Granny requires melee settings");
                  return new MeleeAttack(context, settings);
            },
            aim: context => {
                  const settings = context.config.forms.transformed?.components.aim;
                  if (!settings) throw new Error("Granny requires transformed aim settings");
                  return new SpriteAim(context, settings);
            },
            shotgun: context => {
                  const settings = context.config.forms.transformed?.components.projectile;
                  if (!settings) throw new Error("Granny requires transformed projectile settings");
                  return new ProjectileEmitter(context, settings);
            },
      },
      tasks: {},
      behavior: grannyBehavior,
});
