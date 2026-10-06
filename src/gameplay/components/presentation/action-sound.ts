import type { Entity } from "../../../engine/entity";
import type { ScriptScope } from "../../../engine/scripting";

let nextPlayback = 0;
/** Emit scoped presentation intent. Simulation never owns audio assets or a browser clock. */
export function actionSound(entity: Entity, scope: ScriptScope, cue?: string): void {
      if (!cue) return;
      const token = `${entity.runtimeId}:sound:${++nextPlayback}`;
      entity.presentation.emit("sound", { cue, token });
      scope.add(() => entity.presentation.emit("sound-stop", { cue, token }));
}
