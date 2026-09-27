import { selectTarget } from "../abilities/targeting";
import type {
      AbilityConfig,
      DamageAction,
      KnockbackAction,
      SwingAction,
} from "../abilities/types";
import type { Fighter } from "../entities/fighter";
import { SwingSkill } from "../skills/swing-skill";
import { FighterBehavior } from "./fighter-behavior";
import type { FighterBehaviorContext } from "./types";

/** Shared orchestration for close-range melee fighters. */
export abstract class SwingBehavior extends FighterBehavior {
      private readonly swingSkill = new SwingSkill();
      private target: Fighter | null = null;

      constructor(fighter: Fighter, context: FighterBehaviorContext) {
            super(fighter, context);
      }

      override onUpdate(_deltaMs: number): void {
            if (this.fighter.isDead) return this.reset();
            this.fighter.abilities.update();
            this.swingSkill.update(this.fighter.abilities.state, this.target);

            if (this.fighter.abilities.state === "idle") {
                  this.target = null;
                  this.tryActivate();
            }
      }

      override getWeaponSwingAngle(): number | null {
            return this.swingSkill.getAngle(
                  this.fighter.abilities.state,
                  this.fighter.abilities.timer,
            );
      }

      override reset(): void {
            this.swingSkill.stop();
            this.target = null;
            this.fighter.abilities.reset();
      }

      private tryActivate(): void {
            const now = this.context.now();
            const activation = this.fighter.config.abilities
                  .filter((ability) => this.fighter.abilities.canUse(ability, now))
                  .map((ability) => ({
                        ability,
                        target: selectTarget(
                              this.fighter,
                              this.context.characters,
                              ability.trigger,
                        ),
                  }))
                  .find((candidate) => candidate.target !== null);
            if (!activation?.target) return;

            const { ability, target } = activation;
            const swing = ability.actions.find(
                  (action): action is SwingAction => action.type === "swing",
            ) ?? null;
            const damage = ability.actions.find(
                  (action): action is DamageAction => action.type === "damage",
            );
            const knockback = ability.actions.find(
                  (action): action is KnockbackAction => action.type === "knockback",
            );
            this.target = target;
            this.fighter.abilities.start(ability, this.fighter.facing, now);
            this.fighter.abilities.lockFacingToward(
                  target.body.position.x,
                  this.fighter.body.position.x,
            );
            this.swingSkill.start({
                  action: swing,
                  activeFrames: ability.timing.activeFrames,
                  onHitEnemy: (enemy) =>
                        this.hit(ability, enemy, damage, knockback),
            });
      }

      private hit(
            ability: AbilityConfig,
            target: Fighter,
            damage: DamageAction | undefined,
            knockback: KnockbackAction | undefined,
      ): void {
            let connected = false;
            if (damage) {
                  connected = this.context.dealDamage(
                        this.fighter,
                        target,
                        damage.amount,
                  );
            }
            if (knockback) {
                  this.context.applyKnockback(
                        this.fighter,
                        target,
                        knockback.forceMagnitude,
                  );
                  connected = true;
            }
            if (connected) this.fighter.audio.playAbilityCue(ability, "hit");
      }
}
