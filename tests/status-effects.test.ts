import { describe, expect, it } from "vitest";
import { StatusEffectController } from "../src/status-effects";

describe("StatusEffectController", () => {
      it("starts with unrestricted capabilities and provides the initial definitions", () => {
            const statuses = new StatusEffectController();

            expect(statuses.capabilities).toEqual({
                  canStartAbilities: true,
                  canContinueAbility: true,
                  canUseMovement: true,
            });
            expect(statuses.apply({ effect: "stun", durationMs: 500 })).toEqual({
                  applied: true,
                  refreshed: false,
            });
            expect(statuses.capabilities).toEqual({
                  canStartAbilities: false,
                  canContinueAbility: false,
                  canUseMovement: false,
            });

            statuses.clear();
            statuses.apply({ effect: "ability-lock", durationMs: 500 });
            expect(statuses.capabilities).toEqual({
                  canStartAbilities: false,
                  canContinueAbility: true,
                  canUseMovement: true,
            });
      });

      it("refreshes an effect to the longer of its remaining time and new duration", () => {
            const statuses = new StatusEffectController();
            statuses.apply({ effect: "stun", durationMs: 1_000, sourceId: "first" });
            statuses.update(700);

            expect(statuses.apply({ effect: "stun", durationMs: 200, sourceId: "second" })).toEqual({
                  applied: true,
                  refreshed: true,
            });
            expect(statuses.getActiveEffects()).toEqual([
                  {
                        effect: "stun",
                        sourceId: "second",
                        durationMs: 300,
                        remainingMs: 300,
                  },
            ]);

            statuses.update(100);
            statuses.apply({ effect: "stun", durationMs: 500, sourceId: "third" });
            expect(statuses.getActiveEffects()[0]).toEqual({
                  effect: "stun",
                  sourceId: "third",
                  durationMs: 500,
                  remainingMs: 500,
            });
      });

      it("allows different effects to coexist and intersects their capabilities", () => {
            const statuses = new StatusEffectController();
            statuses.apply({ effect: "ability-lock", durationMs: 100 });
            statuses.apply({ effect: "stun", durationMs: 50 });

            expect(statuses.getActiveEffects()).toHaveLength(2);
            expect(statuses.capabilities).toEqual({
                  canStartAbilities: false,
                  canContinueAbility: false,
                  canUseMovement: false,
            });

            statuses.update(50);
            expect(statuses.capabilities).toEqual({
                  canStartAbilities: false,
                  canContinueAbility: true,
                  canUseMovement: true,
            });
      });

      it("expires exactly at the duration boundary", () => {
            const statuses = new StatusEffectController();
            statuses.apply({ effect: "ability-lock", durationMs: 250 });

            statuses.update(249);
            expect(statuses.getActiveEffects()[0]?.remainingMs).toBe(1);
            statuses.update(1);
            expect(statuses.getActiveEffects()).toEqual([]);
            expect(statuses.canStartAbilities).toBe(true);
      });

      it("produces equivalent snapshots for different delta chunk sizes", () => {
            const advance = (chunks: number[]) => {
                  const statuses = new StatusEffectController();
                  statuses.apply({ effect: "stun", durationMs: 1_000, sourceId: "attacker" });
                  for (const deltaMs of chunks) statuses.update(deltaMs);
                  return statuses.getActiveEffects();
            };

            expect(advance([100, 250, 150])).toEqual(advance([500]));
            expect(advance([100, 250, 150])).toEqual([
                  {
                        effect: "stun",
                        sourceId: "attacker",
                        durationMs: 1_000,
                        remainingMs: 500,
                  },
            ]);
      });

      it("expires at the same mathematical boundary despite fractional delta rounding", () => {
            const chunked = new StatusEffectController();
            const singleStep = new StatusEffectController();
            chunked.apply({ effect: "stun", durationMs: 1 });
            singleStep.apply({ effect: "stun", durationMs: 1 });

            for (let step = 0; step < 10; step++) chunked.update(0.1);
            singleStep.update(1);

            expect(chunked.getActiveEffects()).toEqual([]);
            expect(chunked.getActiveEffects()).toEqual(singleStep.getActiveEffects());
      });

      it("keeps the newest source attribution when the same effect is refreshed", () => {
            const statuses = new StatusEffectController();
            statuses.apply({ effect: "stun", durationMs: 100, sourceId: "fighter-a" });
            statuses.apply({ effect: "stun", durationMs: 200, sourceId: "fighter-b" });

            expect(statuses.getActiveEffects()[0]?.sourceId).toBe("fighter-b");
      });

      it("returns frozen snapshots that cannot mutate internal state", () => {
            const statuses = new StatusEffectController();
            statuses.apply({ effect: "stun", durationMs: 100, sourceId: "attacker" });
            const snapshot = statuses.getActiveEffects();

            expect(Object.isFrozen(snapshot)).toBe(true);
            expect(Object.isFrozen(snapshot[0])).toBe(true);
            expect(() => {
                  (snapshot as unknown as unknown[]).push({ effect: "ability-lock" });
            }).toThrow(TypeError);
            expect(() => {
                  (snapshot[0] as unknown as { remainingMs: number }).remainingMs = 0;
            }).toThrow(TypeError);
            expect(statuses.getActiveEffects()[0]?.remainingMs).toBe(100);
      });

      it("clears every effect and restores default capabilities", () => {
            const statuses = new StatusEffectController();
            statuses.apply({ effect: "stun", durationMs: 100 });
            statuses.apply({ effect: "ability-lock", durationMs: 200 });
            statuses.clear();

            expect(statuses.getActiveEffects()).toEqual([]);
            expect(statuses.capabilities).toEqual({
                  canStartAbilities: true,
                  canContinueAbility: true,
                  canUseMovement: true,
            });
      });

      it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
            "rejects invalid duration %s without changing active effects",
            (durationMs) => {
                  const statuses = new StatusEffectController();
                  statuses.apply({ effect: "stun", durationMs: 100, sourceId: "original" });
                  const before = statuses.getActiveEffects();

                  expect(statuses.apply({ effect: "stun", durationMs, sourceId: "invalid" })).toEqual({
                        applied: false,
                        reason: "invalid-duration",
                  });
                  expect(statuses.getActiveEffects()).toEqual(before);
            },
      );

      it("guards unknown effect IDs at runtime", () => {
            const statuses = new StatusEffectController();
            expect(statuses.apply({ effect: "unknown" as "stun", durationMs: 100 })).toEqual({
                  applied: false,
                  reason: "unknown-effect",
            });
            expect(statuses.getActiveEffects()).toEqual([]);
      });

      it("rejects invalid simulation deltas", () => {
            const statuses = new StatusEffectController();
            expect(() => statuses.update(-1)).toThrow(RangeError);
            expect(() => statuses.update(Number.NaN)).toThrow(RangeError);
            expect(() => statuses.update(Number.POSITIVE_INFINITY)).toThrow(RangeError);
      });
});
