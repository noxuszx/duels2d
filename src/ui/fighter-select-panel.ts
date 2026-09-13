import type { FighterConfig } from "../types/fighter";
import type { GameManager } from "../engine/game-manager";

export class FighterSelectPanel {
  private readonly root: HTMLElement | null;
  private readonly searchInput: HTMLInputElement | null;
  private readonly grid: HTMLElement | null;
  private readonly closeButton: HTMLButtonElement | null;
  private query: string;

  constructor(private readonly game: GameManager) {
    this.root = document.getElementById('character-select-panel');
    this.searchInput = document.getElementById('character-select-search') as HTMLInputElement | null;
    this.grid = document.getElementById('character-select-grid');
    this.closeButton = document.getElementById('character-select-close') as HTMLButtonElement | null;
    this.query = '';

    if (!this.root || !this.searchInput || !this.grid || !this.closeButton) return;

    this._bindEvents();
    this.render();
  }

  open() {
    if (!this.root) return;
    this.root.classList.remove('hidden');
    this.render();
    this.searchInput?.focus();
  }

  close() {
    if (!this.root) return;
    this.root.classList.add('hidden');
  }

  toggle() {
    if (!this.root) return;
    if (this.root.classList.contains('hidden')) {
      this.open();
    } else {
      this.close();
    }
  }

  render() {
    if (!this.grid) return;

    const selectedIds = this.game.getSelectedCharacterIds();
    const normalizedQuery = this.query.trim().toLowerCase();
    const configs = this.game.fighterRoster.filter((config: FighterConfig) => {
      if (!normalizedQuery) return true;
      return `${config.name} ${config.id}`.toLowerCase().includes(normalizedQuery);
    });

    this.grid.innerHTML = '';
    configs.forEach((config) => {
      this.grid!.appendChild(this._createCard(config, selectedIds));
    });
  }

  _bindEvents() {
    if (!this.closeButton || !this.searchInput) return;
    this.closeButton.addEventListener('click', () => this.close());
    this.searchInput.addEventListener('input', () => {
      this.query = this.searchInput!.value;
      this.render();
    });
  }

  _createCard(config: FighterConfig, selectedIds: string[]): HTMLButtonElement {
    const selectedIndex = selectedIds.indexOf(config.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'character-card';
    card.dataset.characterId = config.id;

    if (selectedIndex !== -1) {
      card.classList.add('selected', selectedIndex === 0 ? 'selected-p1' : 'selected-p2');
    }

    const preview = document.createElement('div');
    preview.className = 'character-card-preview';

    const img = document.createElement('img');
    img.alt = config.name;
    const idlePose = config.poses?.idle;
    img.src = typeof idlePose === "string" ? idlePose : idlePose?.image ?? config.image ?? "";
    img.onerror = () => {
      preview.classList.add('missing-image');
      img.remove();
    };
    preview.appendChild(img);

    const badge = document.createElement('div');
    badge.className = 'character-card-badge';
    badge.textContent = selectedIndex === -1 ? '' : `P${selectedIndex + 1}`;
    preview.appendChild(badge);

    const name = document.createElement('div');
    name.className = 'character-card-name';
    name.textContent = config.name;

    card.append(preview, name);
    card.addEventListener('click', () => this._selectCharacter(config.id));
    return card;
  }

  _selectCharacter(characterId: string) {
    const selectedIds = this.game.getSelectedCharacterIds();
    const existingIndex = selectedIds.indexOf(characterId);

    if (existingIndex !== -1) {
      return;
    } else if (selectedIds.length < 2) {
      selectedIds.push(characterId);
    } else {
      selectedIds[0] = selectedIds[1];
      selectedIds[1] = characterId;
    }

    this.game.setSelectedCharacterIds(selectedIds);
    this.render();
  }
}
