import type { Entity } from "../engine/entity";

export interface ImpactSettings {
      minSpeedMultiplier?: number;
      minSpeed?: number;
      damage?: number;
}

export type MatchOutcome =
      | { kind: "winner"; teamId: string }
      | { kind: "draw" };

/** Team victory and ambient impact tuning, independent of Matter and the browser. */
export class MatchRules {
      private contested = false;
      private outcomeValue: MatchOutcome | null = null;
      private readonly registeredTeams = new Set<string>();

      constructor(readonly impact: ImpactSettings = {}) {}

      get outcome(): MatchOutcome | null { return this.outcomeValue; }

      observeSpawn(entity: Entity): void {
            if (entity.ownerId !== null || !entity.tags.has("contestant")) return;
            this.registeredTeams.add(entity.teamId);
            if (this.registeredTeams.size > 1) this.contested = true;
      }

      /** Summons and projectiles have an owner and do not count as contestants. */
      evaluate(entities: readonly Entity[]): MatchOutcome | null {
            if (this.outcomeValue) return this.outcomeValue;
            const contestants = entities.filter(entity => entity.ownerId === null &&
                  entity.tags.has("contestant") && !entity.isRemoved);
            if (!this.contested) return null;
            const surviving = new Set(contestants.filter(entity => !entity.isDead).map(entity => entity.teamId));
            if (surviving.size > 1) return null;
            this.outcomeValue = surviving.size === 0
                  ? { kind: "draw" }
                  : { kind: "winner", teamId: surviving.values().next().value! };
            return this.outcomeValue;
      }

      impactDamage(entity: Entity, incomingSpeed: number, baseSpeed: number): number {
            if (entity.isDead || entity.isRemoved || !Number.isFinite(incomingSpeed) || incomingSpeed <= 0)
                  return 0;
            const threshold = this.impact.minSpeed ?? baseSpeed * (this.impact.minSpeedMultiplier ?? 2.8);
            if (!Number.isFinite(threshold) || threshold <= 0 || incomingSpeed <= threshold) return 0;
            const baseDamage = this.impact.damage ?? 45;
            return Math.max(1, Math.min(baseDamage * 4,
                  Math.round(baseDamage * (incomingSpeed - threshold) / threshold)));
      }

      reset(): void { this.contested = false; this.outcomeValue = null; this.registeredTeams.clear(); }
}
