import type { AbilityConfig, AbilityState } from "../abilities/types";
import type { Fighter } from "../entities/fighter";
import type { FighterBehaviorContext } from "../behaviors/types";
import type { AbilityStartResult } from "../entities/fighter-abilities";
import { ActionScope, type CancellationReason } from "./action-scope";

export interface AbilityScript {
      windup?(scope: ActionScope): void;
      active?(scope: ActionScope): void;
      recovery?(scope: ActionScope): void;
}

/** One scripted move at a time, using the existing casting/timing authority. */
export class AbilityRunner {
      private scope = new ActionScope();
      private script: AbilityScript | null = null;
      private ability: AbilityConfig | null = null;
      private phase: AbilityState = "idle";

      constructor(
            private readonly fighter: Fighter,
            private readonly context: Pick<FighterBehaviorContext, "now" | "characters" | "isCombatActive">,
      ) {}

      start(ability: AbilityConfig, target: Fighter, script: AbilityScript): AbilityStartResult {
            if (this.script && this.fighter.abilities.active !== this.ability) this.cancel();
            if (this.context.isCombatActive?.() === false) return { started: false, reason: "combat-ended" };
            if (!this.validTarget(target)) return { started: false, reason: "invalid-target" };
            const result = this.fighter.abilities.tryStart(ability, this.fighter.facing, this.context.now());
            if (!result.started) return result;
            this.fighter.abilities.lockFacingToward(target.body.position.x, this.fighter.body.position.x);
            this.ability = ability;
            this.script = script;
            try {
                  this.enterPhase();
                  this.advance(0);
            }
            catch (error) { this.cancel(); throw error; }
            return result;
      }

      update(deltaMs: number): void {
            if (this.fighter.isDead) return this.cancel("death");
            if (!this.script || deltaMs < 0) return;
            if (this.fighter.abilities.active !== this.ability) return this.cancel("interrupted");
            try {
                  this.advance(deltaMs);
            } catch (error) { this.cancel(); throw error; }
      }

      get isDashing(): boolean { return this.scope.isDashing; }
      get remainingMs(): number { return this.fighter.abilities.remainingMs; }
      get owner(): Fighter { return this.fighter; }

      ownsActiveScope(scope: ActionScope): boolean {
            return scope === this.scope && !scope.isClosed && this.phase === "active" &&
                  this.fighter.abilities.active === this.ability && !this.fighter.isDead;
      }

      handleFighterCollision(target: Fighter): void {
            if (this.validTarget(target)) this.scope.handleFighterCollision(target);
      }

      handleWallCollision(wall: Parameters<ActionScope["handleWallCollision"]>[0]): void {
            this.scope.handleWallCollision(wall);
      }

      cancel(reason: CancellationReason = "interrupted"): void {
            this.scope.cancel(reason);
            this.script = null;
            this.ability = null;
            this.phase = "idle";
            this.fighter.abilities.reset();
      }

      validTarget(target: Fighter): boolean {
            return target !== this.fighter && !target.isDead && this.context.characters.includes(target);
      }

      finishActive(): void {
            if (!this.script || this.fighter.abilities.active !== this.ability ||
                  this.fighter.abilities.state !== "active") return;
            this.fighter.abilities.finishActive();
            this.enterPhase();
            this.advance(0);
      }

      private advance(deltaMs: number): void {
            this.fighter.abilities.update(deltaMs, {
                  tick: (_phase, elapsedMs) => this.scope.update(elapsedMs),
                  transition: () => this.enterPhase(),
            });
      }

      private enterPhase(): void {
            const phase = this.fighter.abilities.state;
            if (phase === this.phase) return;
            this.scope.cancel("phase-ended");
            this.scope = new ActionScope();
            this.phase = phase;
            if (phase === "idle") {
                  this.script = null;
                  this.ability = null;
            } else this.script?.[phase]?.(this.scope);
      }
}
