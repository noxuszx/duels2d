import { defineFighter } from "../../../gameplay/fighter-factory";
import { Forms, Visuals } from "../../../gameplay/components";
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
