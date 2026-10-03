import type { Fighter } from "../../entities/fighter";
import type { AimSolution } from "../../skills/aim-skill";
import { TrackingAimSkill } from "../../skills/tracking-aim-skill";
import type { FighterBehaviorContext } from "../types";
import { FighterBehavior } from "../fighter-behavior";
import { AbilityRunner, type AbilityScript } from "../../gameplay/ability-runner";
import { AutoUseAbility } from "../../gameplay/auto-use-ability";
import type { AlienLaserSettings } from "../settings";

/** Aim at the nearest enemy and fire an instant laser whenever the move is ready. */
export class AlienBehavior extends FighterBehavior {
      private readonly gun: TrackingAimSkill;

      constructor(fighter: Fighter, context: FighterBehaviorContext) {
            super(fighter, context);
            const definition = fighter.config.behavior;
            if (definition?.type !== "alien-laser") throw new Error("Alien requires alien-laser settings");
            const settings = definition.settings;
            if (![settings.intervalMs, settings.range, settings.width].every(value => Number.isFinite(value) && value > 0) ||
                  ![settings.damage, settings.flashMs].every(value => Number.isFinite(value) && value >= 0) ||
                  typeof settings.color !== "string" || !settings.color.length)
                  throw new Error("Invalid alien-laser settings");

            // Registration order: advance the move, aim the gun, then request a ready shot.
            const moves = this.runtime.use(new AbilityRunner(fighter, context));
            this.gun = this.runtime.use(new TrackingAimSkill(fighter, context));
            this.runtime.use(new AutoUseAbility(moves, {
                  ability: {
                        id: "alien-laser", trigger: { type: "nearest-enemy" },
                        timing: { cooldownMs: settings.intervalMs, windupMs: 0, activeMs: 0, recoveryMs: 0 },
                        actions: [{ type: "damage", amount: settings.damage }],
                  },
                  target: () => this.gun.target,
                  initialDelayMs: settings.intervalMs,
                  script: () => this.laserShot(settings),
            }));
      }

      /** Each shot snapshots the current muzzle; shared laser combat resolves its damage. */
      private laserShot(settings: AlienLaserSettings): AbilityScript | null {
            const aim = this.gun.current;
            if (!aim || !this.context.fireLaser) return null;
            const shot = {
                  origin: { ...aim.origin }, direction: { ...aim.direction },
                  length: settings.range, width: settings.width, damage: settings.damage,
                  color: settings.color, flashMs: settings.flashMs,
            };
            return { active: () => this.context.fireLaser?.(this.fighter, shot) };
      }

      override getWeaponAim(): AimSolution | null { return this.gun.current; }
}
