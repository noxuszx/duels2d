import { defineFighter } from "../../../gameplay/fighter-factory";
import { Dasher, Targeting, WallCrawler } from "../../../gameplay/components";
import { babyBehavior } from "./behavior";

export const babyMan = defineFighter({
      id: "babyman",
      components: {
            targeting: context => new Targeting(context, context.config.faceTarget),
            wallCrawl: context => {
                  if (!context.config.components.wallCrawl) throw new Error("Baby Man requires wallCrawl settings");
                  return new WallCrawler(context, context.config.components.wallCrawl);
            },
            dash: context => {
                  if (!context.config.components.dash) throw new Error("Baby Man requires dash settings");
                  return new Dasher(context, context.config.components.dash);
            },
      },
      tasks: { onWallContact: "wall-crawl-charge" },
      behavior: babyBehavior,
});
