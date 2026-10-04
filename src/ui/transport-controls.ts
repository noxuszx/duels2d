import type { GameApp } from "../app/game-app";

export class TransportControls {
      private readonly playButton: HTMLButtonElement;
      private readonly pauseButton: HTMLButtonElement;

      constructor(private readonly game: GameApp) {
            this.playButton = this.getButton("transport-play");
            this.pauseButton = this.getButton("transport-pause");
            const restartButton = this.getButton("transport-restart");
            const characterSelectButton = this.getButton("character-select-tab");

            this.playButton.addEventListener("click", () => this.game.start());
            this.pauseButton.addEventListener("click", () => this.game.pause());
            restartButton.addEventListener("click", () => this.game.restart());
            characterSelectButton.addEventListener("click", () =>
                  this.game.openCharacterSelect(),
            );
            window.addEventListener("keydown", (event) => {
                  if (event.code !== "Space" || !this.game.paused) return;
                  const target = event.target;
                  if (
                        target instanceof HTMLInputElement ||
                        target instanceof HTMLTextAreaElement ||
                        target instanceof HTMLSelectElement ||
                        (target instanceof HTMLElement && target.isContentEditable)
                  ) return;
                  event.preventDefault();
                  this.game.start();
            });
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
