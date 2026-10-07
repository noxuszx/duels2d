import { defineFighter } from "../../../gameplay/fighter-factory";
import { Targeting } from "../../../gameplay/components";
import { muscleManBehavior } from "./behavior";

export const muscleMan = defineFighter({
      id: "muscleman",
      components: {
            targeting: context => new Targeting(context, context.config.faceTarget),
      },
      tasks: { onUpdate: "power-throw" },
      behavior: muscleManBehavior,
});
