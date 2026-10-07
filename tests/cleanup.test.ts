import { describe, expect, it, vi } from "vitest";
import { runAll } from "../src/engine/cleanup";
import { ScriptScope } from "../src/engine/scripting";

describe("shared cleanup", () => {
      it("runs every action in order and propagates the first failure", () => {
            const calls: number[] = [];
            const failure = new Error("first failure");
            expect(() => runAll([
                  () => { calls.push(1); throw failure; },
                  () => { calls.push(2); throw new Error("later failure"); },
                  () => { calls.push(3); },
            ])).toThrow(failure);
            expect(calls).toEqual([1, 2, 3]);
      });

      it("preserves thrown undefined and still runs remaining actions", () => {
            const later = vi.fn();
            let caught = false;
            try { runAll([() => { throw undefined; }, later]); }
            catch (error) { caught = true; expect(error).toBeUndefined(); }
            expect(caught).toBe(true);
            expect(later).toHaveBeenCalledOnce();
      });

      it("runs scope cleanup in reverse order, continuing after failures and closing once", () => {
            const scope = new ScriptScope();
            const calls: number[] = [];
            const failure = new Error("first during release");
            scope.add(() => { calls.push(1); });
            scope.add(() => { calls.push(2); throw new Error("second during release"); });
            scope.add(() => { calls.push(3); throw failure; });
            expect(() => scope.release()).toThrow(failure);
            expect(scope.isClosed).toBe(true);
            expect(calls).toEqual([3, 2, 1]);
            scope.release();
            expect(calls).toEqual([3, 2, 1]);
      });
});
