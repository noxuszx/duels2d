class CommandLineController {
  constructor(gameManager) {
    this.game = gameManager;
    this.container = document.getElementById('command-line');
    this.input = document.getElementById('command-input');
    this.status = document.getElementById('command-status');

    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      // Toggle on Ctrl + Space
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        this.toggle();
        return;
      }

      if (!this.container.classList.contains('hidden')) {
        // Close on Escape
        if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
          return;
        }

        // Execute on Enter
        if (e.key === 'Enter') {
          e.preventDefault();
          this.execute(this.input.value);
          return;
        }

        // Prevent other game hotkeys when focused
        e.stopPropagation();
      } else {
        // Global Spacebar unpause
        if (e.code === 'Space') {
          if (this.game.paused) {
            e.preventDefault();
            this.game.start();
          }
        }
      }
    });
  }

  toggle() {
    if (this.container.classList.contains('hidden')) {
      this.open();
    } else {
      this.close();
    }
  }

  open() {
    this.container.classList.remove('hidden');
    this.status.textContent = '';
    this.input.value = '';
    this.input.focus();
  }

  close() {
    this.container.classList.add('hidden');
    this.input.blur();
  }

  execute(rawInput) {
    const text = rawInput.trim();
    if (!text) return;

    const tokens = text.toLowerCase().split(/\s+/);
    const command = tokens[0];

    this.status.textContent = '';

    switch (command) {
      case 'start':
        if (this.game.gameOver) {
          this.status.textContent = 'Use restart to begin a new match';
        } else if (!this.game.paused && this.game.started) {
          this.status.textContent = 'Already running';
        } else {
          this.game.start();
          this.close();
        }
        break;

      case 'pause':
        this.game.pause();
        this.close();
        break;

      case 'restart':
        this.game.restart();
        this.close();
        break;

      case 'select':
        this.game.openCharacterSelect();
        this.status.textContent = 'Character selection coming soon';
        // Keeps command line open so user can see status
        break;

      default:
        this.status.textContent = `Unknown command: ${command}`;
        break;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (window.game) {
      window.commandLine = new CommandLineController(window.game);
    }
  }, 0);
});
