import type { EventSource, EventStamp } from "../../events/source";
import type { ScriptOperation } from "../operation";

export type EventWaitResult<T> =
      | { readonly kind: "event"; readonly payload: T; readonly stamp: EventStamp }
      | { readonly kind: "timeout" }
      | { readonly kind: "source-closed" };
export interface EventWaitOptions<T> {
      filter?: (payload: T) => boolean;
      timeoutMs?: number;
}

type Delivery<T> = { kind: "result"; value: EventWaitResult<T> } | { kind: "failure"; error: unknown };

/** Arm on start; delivery is staged for the next simulation step, never the emitting stack. */
export function waitForEvent<Events extends object, K extends keyof Events>(source: EventSource<Events>,
      name: K, options: EventWaitOptions<Events[K]> = {}): ScriptOperation<EventWaitResult<Events[K]>> {
      if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0))
            throw new RangeError("Event timeout must be finite and nonnegative");
      let delivery: Delivery<Events[K]> | undefined;
      let deadline = Infinity;
      let pending = false;
      let cancelled = false;
      let started = false;
      let release = () => { };
      const stage = (outcome: Delivery<Events[K]>) => {
            if (pending || cancelled) return;
            pending = true;
            release();
            source.scheduler.stage(() => {
                  if (cancelled) return;
                  delivery = outcome;
            });
      };
      return {
            start(scope) {
                  if (started || cancelled || scope.isClosed) return false;
                  started = true;
                  const scheduler = source.scheduler;
                  deadline = scheduler.clock.nowMs + (options.timeoutMs ?? Infinity);
                  if (options.timeoutMs === 0) { delivery = { kind: "result", value: { kind: "timeout" } }; return true; }
                  const offEvent = source.on(name, (payload, stamp) => {
                        if (pending || cancelled) return;
                        if (stamp.nowMs >= deadline) { stage({ kind: "result", value: { kind: "timeout" } }); return; }
                        try {
                              if (!options.filter || options.filter(payload))
                                    stage({ kind: "result", value: Object.freeze({ kind: "event", payload, stamp }) });
                        } catch (error) { stage({ kind: "failure", error }); }
                  });
                  release = offEvent;
                  const offClose = source.onClose(() => stage({ kind: "result", value: {
                        kind: scheduler.clock.nowMs >= deadline ? "timeout" : "source-closed" },
                  }));
                  const offDeadline = Number.isFinite(deadline) ? scheduler.at(deadline, () => {
                        if (cancelled || pending) return;
                        delivery = { kind: "result", value: { kind: "timeout" } };
                        release();
                  }) : () => { };
                  release = () => { offEvent(); offClose(); offDeadline(); };
                  scope.add(() => { cancelled = true; release(); });
                  if (pending) release();
                  return true;
            },
            advance(deltaMs) {
                  if (delivery?.kind === "failure") throw delivery.error;
                  // Readiness is published at the simulation barrier, outside nested branch budgets.
                  return deltaMs;
            },
            get isComplete() {
                  if (delivery?.kind === "failure") throw delivery.error;
                  return delivery !== undefined;
            },
            get result() {
                  if (!delivery) throw new Error("Cannot read an event wait result before completion");
                  if (delivery.kind === "failure") throw delivery.error;
                  return delivery.value;
            },
            get endReason() {
                  if (delivery?.kind !== "result") return undefined;
                  return delivery.value.kind === "event" ? "complete" : delivery.value.kind;
            },
            cancel() { cancelled = true; release(); },
      };
}
