import type { FighterConfig } from "../types/fighter";
import type { GameManager } from "../engine/game-manager";

export class FighterSelectPanel {
      private readonly root: HTMLElement | null;
      private readonly searchInput: HTMLInputElement | null;
      private readonly grid: HTMLElement | null;
      private readonly closeButton: HTMLButtonElement | null;
      private readonly resultCount: HTMLElement | null;
      private readonly playerOne: HTMLElement | null;
      private readonly playerTwo: HTMLElement | null;
      private query: string;
      private pendingSelectedIds: string[];

      constructor(private readonly game: GameManager) {
            this.root = document.getElementById("character-select-panel");
            this.searchInput = document.getElementById(
                  "character-select-search",
            ) as HTMLInputElement | null;
            this.grid = document.getElementById("character-select-grid");
            this.closeButton = document.getElementById(
                  "character-select-close",
            ) as HTMLButtonElement | null;
            this.resultCount = document.getElementById("character-result-count");
            this.playerOne = document.getElementById("selected-player-one");
            this.playerTwo = document.getElementById("selected-player-two");
            this.query = "";
            this.pendingSelectedIds = [];

            if (
                  !this.root ||
                  !this.searchInput ||
                  !this.grid ||
                  !this.closeButton
            )
                  return;

            this._bindEvents();
            this.render();
      }

      open() {
            if (!this.root) return;
            this.pendingSelectedIds = [];
            this.root.classList.remove("hidden");
            this.render();
            this.searchInput?.focus();
      }

      close() {
            if (!this.root) return;
            this.root.classList.add("hidden");
      }

      toggle() {
            if (!this.root) return;
            if (this.root.classList.contains("hidden")) {
                  this.open();
            } else {
                  this.close();
            }
      }

      render() {
            if (!this.grid) return;

            const selectedIds = this.pendingSelectedIds;
            const normalizedQuery = this.query.trim().toLowerCase();
            const configs = this.game.fighterRoster.filter(
                  (config: FighterConfig) => {
                        if (!normalizedQuery) return true;
                        return `${config.name} ${config.id}`
                              .toLowerCase()
                              .includes(normalizedQuery);
                  },
            );

            this.grid.innerHTML = "";
            configs.forEach((config) => {
                  this.grid!.appendChild(this._createCard(config, selectedIds));
            });
            if (configs.length === 0) {
                  const empty = document.createElement("div");
                  empty.className = "character-select-empty";
                  empty.textContent = "No fighters match your search.";
                  this.grid.appendChild(empty);
            }
            if (this.resultCount) {
                  this.resultCount.textContent = `${configs.length} fighter${
                        configs.length === 1 ? "" : "s"
                  }`;
            }
            const selectedConfigs = selectedIds.map((id) =>
                  this.game.fighterRoster.find((fighter) => fighter.id === id),
            );
            if (this.playerOne) {
                  this.playerOne.textContent =
                        selectedConfigs[0]?.name ?? "Select fighter";
            }
            if (this.playerTwo) {
                  this.playerTwo.textContent =
                        selectedConfigs[1]?.name ?? "Select fighter";
            }
      }

      _bindEvents() {
            if (!this.closeButton || !this.searchInput) return;
            this.closeButton.addEventListener("click", () => this.close());
            this.searchInput.addEventListener("input", () => {
                  this.query = this.searchInput!.value;
                  this.render();
            });
            window.addEventListener("keydown", (event) => {
                  if (
                        event.key === "Escape" &&
                        !this.root?.classList.contains("hidden")
                  ) {
                        event.preventDefault();
                        this.close();
                  }
            });
      }

      _createCard(
            config: FighterConfig,
            selectedIds: string[],
      ): HTMLButtonElement {
            const selectedIndex = selectedIds.indexOf(config.id);
            const card = document.createElement("button");
            card.type = "button";
            card.className = "character-card";
            card.dataset.characterId = config.id;
            card.setAttribute("aria-pressed", String(selectedIndex !== -1));

            if (selectedIndex !== -1) {
                  card.classList.add(
                        "selected",
                        selectedIndex === 0 ? "selected-p1" : "selected-p2",
                  );
            }

            const preview = document.createElement("div");
            preview.className = "character-card-preview";

            const img = document.createElement("img");
            img.alt = config.name;
            const idlePose = config.poses?.idle;
            img.src =
                  typeof idlePose === "string"
                        ? idlePose
                        : (idlePose?.image ?? config.image ?? "");
            img.onerror = () => {
                  preview.classList.add("missing-image");
                  img.remove();
            };
            preview.appendChild(img);

            const badge = document.createElement("div");
            badge.className = "character-card-badge";
            badge.textContent =
                  selectedIndex === -1 ? "" : `P${selectedIndex + 1}`;
            preview.appendChild(badge);

            const name = document.createElement("div");
            name.className = "character-card-name";
            name.textContent = config.name;

            const id = document.createElement("div");
            id.className = "character-card-id";
            id.textContent = config.id;

            card.append(preview, name, id);
            card.addEventListener("click", () =>
                  this._selectCharacter(config.id),
            );
            return card;
      }

      _selectCharacter(characterId: string) {
            if (this.pendingSelectedIds.includes(characterId)) return;

            this.pendingSelectedIds.push(characterId);
            if (this.pendingSelectedIds.length < 2) {
                  this.render();
                  return;
            }

            this.game.setSelectedCharacterIds(this.pendingSelectedIds);
            this.game.pause();
            this.close();
      }
}
