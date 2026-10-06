import { defineFighter } from "../../../gameplay/fighter-factory";
import { SpriteAim, Targeting, Visuals } from "../../../gameplay/components";
import { alienBehavior } from "./behavior";

export const alien = defineFighter({
      id: "alien",
      components: {
            targeting: context => new Targeting(context, context.config.faceTarget),
            aim: context => {
                  const settings = context.config.components.weaponAim;
                  if (!settings) throw new Error("Alien requires weapon aim settings");
                  return new SpriteAim(context, settings, "weapon");
            },
            visuals: context => new Visuals(context),
      },
      tasks: {},
      behavior: alienBehavior,
});
