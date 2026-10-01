import type {
      FighterDefaults,
      FighterDefinition,
} from "../../../src/types/fighter";
import type { StudioConfig, StudioFileHandle } from "../app/editor-types";
import { getSaveContent } from "./fighter-serializer";

export function downloadFighterFile(
      definitions: FighterDefinition[],
      config: StudioConfig,
      defaults?: FighterDefaults,
): void {
      const blob = new Blob([getSaveContent(definitions, config, defaults)], {
            type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${config.id}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function writeFileContent(
      fileHandle: StudioFileHandle,
      content: string,
): Promise<void> {
      const writable = await fileHandle.createWritable();
      try {
            await writable.write(content);
            await writable.close();
      } catch (error) {
            // Discard partial content and release the native stream before retry.
            await writable.abort?.(error).catch(() => {});
            throw error;
      }
}

/** Capture content before asynchronous file access starts. Errors reach the caller. */
export async function writeFighterFile(
      definitions: FighterDefinition[],
      config: StudioConfig,
      fileHandle: StudioFileHandle | undefined,
      defaults?: FighterDefaults,
): Promise<void> {
      if (!fileHandle) return;
      await writeFileContent(
            fileHandle,
            getSaveContent(definitions, config, defaults),
      );
}
