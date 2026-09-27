import type { SpawnProjectileAction } from "../abilities/types";
import type { Fighter } from "../entities/fighter";
import { ProjectileSkill } from "../skills/projectile-skill";
import { FighterBehavior } from "./fighter-behavior";
import type { FighterBehaviorContext } from "./types";

/** Shared orchestration for fighters whose JSON ability is a targeted projectile. */
export abstract class ProjectileBehavior extends FighterBehavior {
      private readonly projectileSkill = new ProjectileSkill();

      constructor(fighter: Fighter, context: FighterBehaviorContext) {
            super(fighter, context);
      }

      override onUpdate(_deltaMs: number): void {
            if (this.fighter.isDead) return this.reset();
            this.fighter.abilities.update();
            if (this.fighter.abilities.state === "idle") this.tryActivate();
      }

      override reset(): void {
            this.fighter.abilities.reset();
      }

      private tryActivate(): void {
            const now = this.context.now();
            const ability = this.fighter.config.abilities.find((candidate) =>
                  candidate.trigger.type === "nearest-enemy" &&
                  this.fighter.abilities.canUse(candidate, now),
            );
            const target = this.context.getNearestEnemy(this.fighter);
            if (!ability || !target) return;
            const action = ability.actions.find(
                  (candidate): candidate is SpawnProjectileAction =>
                        candidate.type === "spawn-projectile",
            );
            if (!action) return;

            this.fighter.abilities.start(ability, this.fighter.facing, now);
            this.fighter.abilities.lockFacingToward(
                  target.body.position.x,
                  this.fighter.body.position.x,
            );
            this.projectileSkill.launch({
                  config: action.projectile,
                  hitSoundCue: ability.audio?.hit ?? null,
                  source: this.fighter,
                  target,
                  world: this.context.world,
                  addProjectile: this.context.addProjectile,
            });
      }
}
