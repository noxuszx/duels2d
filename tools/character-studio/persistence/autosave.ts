import type { StudioFileHandle } from "../app/editor-types";
import { writeFileContent } from "./file-access";

export type SaveStatus = {
      phase: "idle" | "saving" | "saved" | "error";
      pending: number;
      error?: unknown;
};

/** Serialize writes per handle; failures do not block subsequent edits. */
export class AutosaveQueue {
      private tails = new Map<StudioFileHandle, Promise<void>>();
      private listeners = new Set<(status: SaveStatus) => void>();
      private currentStatus: SaveStatus = { phase: "idle", pending: 0 };
      get status(): SaveStatus {
            return { ...this.currentStatus };
      }
      subscribe(listener: (status: SaveStatus) => void): () => void {
            this.listeners.add(listener);
            listener(this.status);
            return () => this.listeners.delete(listener);
      }
      private publish(status: SaveStatus): void {
            this.currentStatus = status;
            for (const listener of this.listeners) listener(this.status);
      }
      enqueue(handle: StudioFileHandle, content: string): Promise<void> {
            const previous = this.tails.get(handle) ?? Promise.resolve();
            this.publish({
                  phase: "saving",
                  pending: this.currentStatus.pending + 1,
            });
            const write = previous
                  .catch(() => {})
                  .then(() => writeFileContent(handle, content));
            const settled = write.then(
                  () => {
                        const pending = this.currentStatus.pending - 1;
                        this.publish({
                              phase: pending ? "saving" : "saved",
                              pending,
                        });
                  },
                  (error) => {
                        this.publish({
                              phase: "error",
                              pending: this.currentStatus.pending - 1,
                              error,
                        });
                        throw error;
                  },
            );
            this.tails.set(handle, settled);
            // Register cleanup with a rejection handler without swallowing the caller's error.
            void settled.then(
                  () => {
                        if (this.tails.get(handle) === settled)
                              this.tails.delete(handle);
                  },
                  () => {
                        if (this.tails.get(handle) === settled)
                              this.tails.delete(handle);
                  },
            );
            return settled;
      }
}
