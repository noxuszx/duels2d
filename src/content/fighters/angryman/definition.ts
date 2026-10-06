import { defineFighter } from "../../../gameplay/fighter-factory";
import { Dasher, Targeting, Visuals } from "../../../gameplay/components";
import { angryManBehavior } from "./behavior";

export const angryMan = defineFighter({
      id: "angryman",
      components: {
            targeting: context => new Targeting(context, context.config.faceTarget),
            visuals: context => new Visuals(context),
            dash: context => {
                  const settings = context.config.components.dash;
                  if (!settings) throw new Error("Angry Man requires dash settings");
                  return new Dasher(context, settings);
            },
      },
      tasks: {},
      behavior: angryManBehavior,
});
