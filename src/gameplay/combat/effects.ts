import type { KnockbackReaction } from "../components/knockback-reaction";
import { Body } from "matter-js";
import type { Entity } from "../../engine/entity";
import type { EntityRegistry } from "../../engine/entity-registry";
import type { StatusId } from "../statuses";
import type { Vector2 } from "../../engine/contracts";

const FORCE_SCALE = ((1000 / 60) / (1000 / 120)) ** 2;

export interface HitEffects {
      damage?: number;
      knockback?: number;
      statuses?: readonly { id: StatusId; durationMs: number }[];
}

export interface HitResult {
      connected: boolean;
      actualDamage: number;
      knockbackApplied: boolean;
      statusesApplied: readonly StatusId[];
      killed: boolean;
}

export type CombatEvent =
      | { kind: "damage"; sourceId: string | null; targetId: string; amount: number; killed: boolean }
      | { kind: "knockback"; sourceId: string; targetId: string; force: number }
      | { kind: "status"; sourceId: string | null; targetId: string; status: StatusId };

export interface DamageOptions {
      sourceId?: string | null;
      cooldownMs?: number;
      independentCooldown?: boolean;
}
export interface HitOptions {
      sourceId?: string;
      independentCooldown?: boolean;
}

/** One shared effect boundary for direct hits, impacts and periodic damage. */
export class CombatResolver {
      private readonly lastDamageAt = new Map<string, number>();

      constructor(
            private readonly entities: EntityRegistry,
            private readonly now: () => number,
            private readonly emit: (event: CombatEvent) => void,
            private readonly defaultCooldownMs: number,
      ) {}

      hit(source: Entity, target: Entity, effects: HitEffects, options: HitOptions = {}): HitResult {
            const miss: HitResult = {
                  connected: false, actualDamage: 0, knockbackApplied: false,
                  statusesApplied: [], killed: false,
            };
            if (!this.entities.isLive(source) || !this.entities.isLive(target) ||
                  source === target || source.teamId === target.teamId) return miss;
            const actualDamage = effects.damage === undefined ? 0 : this.damage(target, effects.damage, {
                  sourceId: options.sourceId ?? source.runtimeId,
                  independentCooldown: options.independentCooldown,
            });
            let knockbackApplied = false;
            if (this.entities.isLive(target) && effects.knockback !== undefined &&
                  Number.isFinite(effects.knockback) && effects.knockback > 0) {
                  knockbackApplied = this.knockback(source, target, effects.knockback, undefined,
                        options.sourceId ?? source.runtimeId);
            }
            const statusesApplied: StatusId[] = [];
            if ((actualDamage > 0 || knockbackApplied ||
                  (effects.damage === undefined && effects.knockback === undefined)) && this.entities.isLive(target)) {
                  for (const status of effects.statuses ?? []) {
                        const result = target.statuses.apply({ ...status, sourceId: options.sourceId ?? source.runtimeId });
                        if (result.applied) {
                              statusesApplied.push(status.id);
                              this.emit({ kind: "status", sourceId: options.sourceId ?? source.runtimeId,
                                    targetId: target.runtimeId, status: status.id });
                        }
                  }
            }
            return { connected: actualDamage > 0 || knockbackApplied || statusesApplied.length > 0,
                  actualDamage, knockbackApplied, statusesApplied, killed: target.isDead };
      }

      /** Shared force scaling for attacks and self-directed recoil. */
      knockback(source: Entity, target: Entity, force: number, direction?: Vector2,
            sourceId = source.runtimeId): boolean {
            if (!this.entities.isLive(source) || !this.entities.isLive(target) ||
                  !Number.isFinite(force) || force <= 0) return false;
            const vector = direction ?? {
                  x: target.body.position.x - source.body.position.x,
                  y: target.body.position.y - source.body.position.y,
            };
            const length = Math.hypot(vector.x, vector.y);
            if (!Number.isFinite(length) || length <= 0) return false;
            Body.applyForce(target.body, target.body.position, {
                  x: vector.x / length * force * FORCE_SCALE,
                  y: vector.y / length * force * FORCE_SCALE,
            });
            if (source !== target) {
                  target.components.get<KnockbackReaction>("knockback-reaction")?.knockedBack(force);
            }
            this.emit({ kind: "knockback", sourceId, targetId: target.runtimeId, force });
            return true;
      }

      damage(target: Entity, amount: number, options: DamageOptions = {}): number {
            if (!this.entities.isLive(target) || !Number.isFinite(amount) || amount <= 0) return 0;
            const nowMs = this.now();
            const cooldown = options.cooldownMs ?? this.defaultCooldownMs;
            if (!Number.isFinite(cooldown) || cooldown < 0) return 0;
            const last = this.lastDamageAt.get(target.runtimeId) ?? -Infinity;
            if (!options.independentCooldown && nowMs - last < cooldown) return 0;
            const actual = target.takeDamage(amount);
            if (actual <= 0) return 0;
            if (!options.independentCooldown) this.lastDamageAt.set(target.runtimeId, nowMs);
            this.emit({ kind: "damage", sourceId: options.sourceId ?? null,
                  targetId: target.runtimeId, amount: actual, killed: target.isDead });
            return actual;
      }

      forget(runtimeId: string): void { this.lastDamageAt.delete(runtimeId); }
      reset(): void { this.lastDamageAt.clear(); }
}
