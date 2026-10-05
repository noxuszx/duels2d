import type { ScriptOperation } from "../../engine/scripting/operation";

/** Wait on content state, observed at simulation boundaries without a polling timer. */
export function until(condition: () => boolean): ScriptOperation {
      let started = false;
      let cancelled = false;
      let complete = false;
      return {
            start(scope) {
                  if (started || cancelled || scope.isClosed) return false;
                  started = true;
                  return true;
            },
            advance: deltaMs => started && !cancelled && !complete ? deltaMs : 0,
            get isComplete() {
                  if (started && !cancelled && !complete) complete = condition();
                  return complete;
            },
            get endReason() { return complete ? "complete" as const : undefined; },
            cancel: () => { cancelled = true; },
      };
}
