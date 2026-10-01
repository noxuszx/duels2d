import type { SaveStatus } from "../persistence/autosave";

/** Surface save failures and progress without replacing the current panel context. */
export function updateSaveStatus(status: SaveStatus): void {
      const label = document.getElementById("save-status");
      if (!label) return;
      label.textContent =
            status.phase === "saving"
                  ? "Saving…"
                  : status.phase === "error"
                    ? "Save failed — use Save to retry"
                    : status.phase === "saved"
                      ? "Saved"
                      : "Ready";
      label.setAttribute("role", "status");
      label.setAttribute("aria-live", "polite");
}
