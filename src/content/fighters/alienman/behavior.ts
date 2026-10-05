import type { BehaviorHandlers, FighterContext } from "../../../gameplay/fighter-factory";
import type { Forms } from "../../../gameplay/components/forms";
import type { Visuals } from "../../../gameplay/components/visuals";
import { wait } from "../../../engine/scripting/wait";
import { createSaucer, type SaucerControl } from "../../actors/saucer/definition";
import { poseSequence } from "../../script-helpers/pose-sequence";

interface AlienManComponents { forms: Forms; visuals: Visuals; }

export function alienManBehavior({ forms, visuals }: AlienManComponents,
      context: FighterContext): BehaviorHandlers {
      const transformed = forms.settings("transformed");
      let saucer: SaucerControl;
      return {
            *onSpawn() {
                  saucer = createSaucer(context);
                  yield wait(0);
            },
            actions: {
                  transformation: {
                        interrupt: true,
                        when: () => !forms.is("transformed") && forms.healthRatio <= transformed.healthRatio!,
                        *run() {
                              yield* poseSequence(visuals, transformed.poses!, transformed.sequence ?? []);
                              forms.enter("transformed");
                              saucer.deploy();
                        },
                  },
            },
      };
}
