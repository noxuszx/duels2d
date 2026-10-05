import { defineFighter } from "../../../gameplay/fighter-factory";
import { Forms } from "../../../gameplay/components/forms";
import { Visuals } from "../../../gameplay/components/visuals";
import { alienManBehavior } from "./behavior";

export const alienMan = defineFighter({
      id: "alienman",
      components: {
            forms: context => new Forms(context),
            visuals: context => new Visuals(context),
      },
      tasks: { onSpawn: "arrival" },
      behavior: alienManBehavior,
});
