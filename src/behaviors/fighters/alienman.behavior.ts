import type { Fighter } from "../../entities/fighter";
import { Saucer } from "../../entities/saucer";
import { EntityAttachment } from "../../gameplay/entity-attachment";
import { ScheduledAction } from "../../gameplay/scheduled-action";
import { HealthThresholdSkill } from "../../skills/health-threshold-skill";
import { assertSaucerSettings } from "../../gameplay/saucer-settings";
import { FighterBehavior } from "../fighter-behavior";
import type { FighterBehaviorContext } from "../types";

/** Keep a saucer overhead; transform at half health, then deploy a finite group of allies. */
export class AlienManBehavior extends FighterBehavior {
      private readonly saucer: EntityAttachment<Saucer>;
      private readonly deployments: ScheduledAction;

      constructor(fighter: Fighter, context: FighterBehaviorContext) {
            super(fighter, context);
            const definition = fighter.config.behavior;
            if (definition?.type !== "saucer-support") throw new Error("Alien Man requires saucer-support settings");
            const settings = definition.settings;
            assertSaucerSettings(settings);

            this.saucer = this.runtime.use(new EntityAttachment(context, () => new Saucer(fighter, settings)));
            const trigger = fighter.transformation.config?.trigger;
            if (trigger?.type === "health-threshold") {
                  this.runtime.use(new HealthThresholdSkill({
                        ratio: () => fighter.healthRatio,
                        threshold: trigger.healthRatio,
                        enabled: () => fighter.transformation.currentState === "base",
                        onReached: () => fighter.transform(),
                  }));
            }
            this.deployments = this.runtime.use(new ScheduledAction(() => context.now(), {
                  delayMs: settings.firstSpawnDelayMs,
                  intervalMs: settings.spawnIntervalMs,
                  limit: settings.maxSpawns,
                  action: () => {
                        const saucer = this.saucer.current;
                        const arena = context.getArenaBounds?.();
                        if (!fighter.transformation.isTransformed || !saucer || saucer.removed || !arena) return false;
                        return !!context.spawnSummon?.(fighter, settings.summonConfigId, saucer.deploymentPosition(arena));
                  },
            }));
      }

      override usesScriptedTransformation(): boolean { return true; }

      override onTransform(): void {
            this.saucer.current?.stopBeam();
            this.deployments.start();
      }
}
