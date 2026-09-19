import type { GameManager } from "../engine/game-manager";

export class TransportControls {
      private readonly playButton: HTMLButtonElement;
      private readonly pauseButton: HTMLButtonElement;

      constructor(private readonly game: GameManager) {
            this.playButton = this.getButton("transport-play");
            this.pauseButton = this.getButton("transport-pause");
            const restartButton = this.getButton("transport-restart");

            this.playButton.addEventListener("click", () => this.game.start());
            this.pauseButton.addEventListener("click", () => this.game.pause());
            restartButton.addEventListener("click", () => this.game.restart());
            window.addEventListener("duels2d:playback", () => this.sync());
            this.sync();
      }

      private getButton(id: string): HTMLButtonElement {
            const button = document.getElementById(id);
            if (!(button instanceof HTMLButtonElement)) {
                  throw new Error(`Missing transport control: ${id}`);
            }
            return button;
      }

      private sync(): void {
            this.playButton.classList.toggle("active", !this.game.paused);
            this.pauseButton.classList.toggle("active", this.game.paused);
            this.playButton.setAttribute("aria-pressed", String(!this.game.paused));
            this.pauseButton.setAttribute("aria-pressed", String(this.game.paused));
      }
}
