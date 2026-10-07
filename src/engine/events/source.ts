import type { ScriptScope } from "../scripting/scope";
import type { EventScheduler } from "./scheduler";
import { runAll } from "../cleanup";

interface Subscription<Args extends unknown[]> {
      notify: ((...args: Args) => void) | null;
      release(): void;
}

export interface EventStamp {
      readonly nowMs: number;
      readonly tick: number;
      readonly sequence: number;
}

/** Typed, future-only events. Payload snapshots belong to the publisher. */
export class EventSource<Events extends object> {
      private schedulerValue: EventScheduler | null = null;
      private listeners = new Map<keyof Events, Set<Subscription<[never, EventStamp]>>>();
      private closing = new Set<Subscription<[]>>();
      private untrack: (() => void) | null = null;
      private closed = false;

      get isClosed(): boolean { return this.closed; }
      get isBound(): boolean { return this.schedulerValue !== null; }
      get scheduler(): EventScheduler {
            if (!this.schedulerValue) throw new Error("Event source is not registered with a simulation");
            return this.schedulerValue;
      }

      bind(scheduler: EventScheduler): void {
            if (this.closed) throw new Error("Cannot bind a closed event source");
            if (this.schedulerValue && this.schedulerValue !== scheduler)
                  throw new Error("Event source already belongs to another simulation");
            if (this.schedulerValue) return;
            this.schedulerValue = scheduler;
            this.untrack = scheduler.track(this);
      }

      on<K extends keyof Events>(name: K, callback: (payload: Events[K], stamp: EventStamp) => void,
            scope?: ScriptScope): () => void {
            if (this.closed) return () => {};
            const listeners = this.listeners.get(name) ?? new Set();
            this.listeners.set(name, listeners);
            return this.subscribe(listeners, (payload, stamp) => callback(payload, stamp), scope);
      }

      onClose(callback: () => void, scope?: ScriptScope): () => void {
            if (this.closed) { callback(); return () => {}; }
            return this.subscribe(this.closing, callback, scope);
      }

      emit<K extends keyof Events>(name: K, payload: Events[K]): void {
            if (this.closed) return;
            const scheduler = this.scheduler;
            const stamp = Object.freeze({ nowMs: scheduler.clock.nowMs, tick: scheduler.clock.tick,
                  sequence: ++scheduler.sequence });
            const listeners = this.listeners.get(name);
            runAll([...(listeners ?? [])].map(listener => () => {
                  if (listeners?.has(listener)) listener.notify?.(payload as never, stamp);
            }));
      }

      close(): void {
            if (this.closed) return;
            this.closed = true;
            const callbacks = [...this.closing];
            for (const listeners of this.listeners.values()) {
                  for (const listener of [...listeners]) listener.release();
            }
            this.listeners.clear();
            this.untrack?.();
            this.untrack = null;
            try {
                  runAll(callbacks.map(listener => () => {
                        if (this.closing.has(listener)) listener.notify?.();
                  }));
            } finally {
                  for (const listener of callbacks) listener.release();
                  this.closing.clear();
            }
      }

      private subscribe<Args extends unknown[]>(listeners: Set<Subscription<Args>>,
            callback: (...args: Args) => void, scope?: ScriptScope): () => void {
            let detachScope: (() => void) | undefined;
            const subscription: Subscription<Args> = {
                  notify: callback,
                  release() {
                        listeners.delete(subscription);
                        subscription.notify = null;
                        detachScope?.();
                        detachScope = undefined;
                  },
            };
            listeners.add(subscription);
            detachScope = scope?.add(subscription.release);
            return subscription.release;
      }
}
