'use strict';

class FighterSelectPanel {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('character-select-panel');
    this.searchInput = document.getElementById('character-select-search');
    this.grid = document.getElementById('character-select-grid');
    this.closeButton = document.getElementById('character-select-close');
    this.query = '';

    if (!this.root || !this.searchInput || !this.grid || !this.closeButton) return;

    this._bindEvents();
    this.render();
  }

  open() {
    if (!this.root) return;
    this.root.classList.remove('hidden');
    this.render();
    this.searchInput.focus();
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
    const configs = window.FighterRoster.filter((config) => {
      if (!normalizedQuery) return true;
      return `${config.name} ${config.id}`.toLowerCase().includes(normalizedQuery);
    });

    this.grid.innerHTML = '';
    configs.forEach((config) => {
      this.grid.appendChild(this._createCard(config, selectedIds));
    });
  }

  _bindEvents() {
    this.closeButton.addEventListener('click', () => this.close());
    this.searchInput.addEventListener('input', () => {
      this.query = this.searchInput.value;
      this.render();
    });
  }

  _createCard(config, selectedIds) {
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
    img.src = config.poses?.idle?.image ?? config.poses?.idle ?? config.image;
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

  _selectCharacter(characterId) {
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

// Temporary alias for backward compatibility during migration
var CharacterSelectPanel = FighterSelectPanel;
