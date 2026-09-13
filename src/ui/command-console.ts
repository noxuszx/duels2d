import type { GameManager } from "../engine/game-manager";

export class CommandLineController {
  private readonly container: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly status: HTMLElement;

  constructor(private readonly game: GameManager) {
    const container = document.getElementById("command-line");
    const input = document.getElementById("command-input");
    const status = document.getElementById("command-status");
    if (
      !(container instanceof HTMLElement) ||
      !(input instanceof HTMLInputElement) ||
      !(status instanceof HTMLElement)
    ) {
      throw new Error("Command console markup is missing required elements.");
    }
    this.container = container;
    this.input = input;
    this.status = status;

    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener("keydown", (e) => {
      // Open on '/' if command line is hidden and user is not typing in an input
      if (
        e.key === "/" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        this.container.classList.contains("hidden")
      ) {
        const active = document.activeElement;
        if (
          active &&
          (active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            (active instanceof HTMLElement && active.isContentEditable))
        ) {
          return;
        }
        e.preventDefault();
        this.open();
        return;
      }

      if (!this.container.classList.contains("hidden")) {
        // Close on Escape
        if (e.key === "Escape") {
          e.preventDefault();
          this.close();
          return;
        }

        // Execute on Enter
        if (e.key === "Enter") {
          e.preventDefault();
          this.execute(this.input.value);
          return;
        }

        // Prevent other game hotkeys when focused
        e.stopPropagation();
      } else {
        // Global Spacebar unpause
        if (e.code === "Space") {
          if (this.game.paused) {
            e.preventDefault();
            this.game.start();
          }
        }
      }
    });
  }

  toggle() {
    if (this.container.classList.contains("hidden")) {
      this.open();
    } else {
      this.close();
    }
  }

  open() {
    this.container.classList.remove("hidden");
    this.status.textContent = "";
    this.input.value = "";
    this.input.focus();
  }

  close() {
    this.container.classList.add("hidden");
    this.input.blur();
  }

  execute(rawInput: string) {
    const text = rawInput.trim();
    if (!text) return;

    const tokens = text.toLowerCase().split(/\s+/);
    const command = tokens[0];

    this.status.textContent = "";

    switch (command) {
      case "start":
        this.game.start();
        this.close();
        break;

      case "pause":
        this.game.pause();
        this.close();
        break;

      case "restart":
        this.game.restart();
        this.close();
        break;

      case "select":
        this.game.openCharacterSelect();
        this.close();
        break;

      case "studio":
        this.status.textContent = "Opening Fighter Studio...";
        setTimeout(() => {
          window.location.href = "tools/character-studio/index.html";
        }, 300);
        break;

      default:
        this.status.textContent = `Unknown command: ${command}`;
        break;
    }
  }
}
