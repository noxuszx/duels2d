import { describe, expect, it, vi } from "vitest";
import { AutosaveQueue } from "../persistence/autosave";
import type { StudioFileHandle } from "../app/editor-types";

function gate() {
      let release!: () => void;
      const promise = new Promise<void>((resolve) => {
            release = resolve;
      });
      return { promise, release };
}

describe("AutosaveQueue", () => {
      it("serializes writes to one file and preserves content captured at enqueue", async () => {
            const firstWrite = gate();
            const started = gate();
            const writes: string[] = [];
            let active = 0;
            let peak = 0;
            const handle: StudioFileHandle = {
                  async createWritable() {
                        active++;
                        peak = Math.max(peak, active);
                        return {
                              async write(content) {
                                    writes.push(content);
                                    if (writes.length === 1) {
                                          started.release();
                                          await firstWrite.promise;
                                    }
                              },
                              async close() {
                                    active--;
                              },
                        };
                  },
            };
            const queue = new AutosaveQueue();
            const first = queue.enqueue(handle, "first");
            const second = queue.enqueue(handle, "second");
            await started.promise;
            expect(writes).toEqual(["first"]);
            expect(queue.status.pending).toBe(2);
            firstWrite.release();
            await Promise.all([first, second]);
            expect(writes).toEqual(["first", "second"]);
            expect(peak).toBe(1);
            expect(queue.status).toMatchObject({ phase: "saved", pending: 0 });
      });
      it("reports failure and allows a later save to recover", async () => {
            let attempts = 0;
            const handle: StudioFileHandle = {
                  async createWritable() {
                        if (++attempts === 1)
                              throw new Error("permission lost");
                        return { async write() {}, async close() {} };
                  },
            };
            const queue = new AutosaveQueue();
            await expect(queue.enqueue(handle, "first")).rejects.toThrow(
                  "permission lost",
            );
            expect(queue.status.phase).toBe("error");
            await queue.enqueue(handle, "retry");
            expect(queue.status.phase).toBe("saved");
            expect(queue.status.error).toBeUndefined();
            expect(queue.status.pending).toBe(0);
      });
});

describe("failed file writes", () => {
      it("aborts partial content before the next queued save", async () => {
            const close = vi.fn(async () => {});
            const abort = vi.fn(async () => {});
            const handle: StudioFileHandle = {
                  async createWritable() {
                        return {
                              write: async () => {
                                    throw new Error("disk full");
                              },
                              close,
                              abort,
                        };
                  },
            };
            const queue = new AutosaveQueue();
            await expect(queue.enqueue(handle, "partial")).rejects.toThrow(
                  "disk full",
            );
            expect(close).not.toHaveBeenCalled();
            expect(abort).toHaveBeenCalledOnce();
      });
});
