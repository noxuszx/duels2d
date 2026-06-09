class CharacterStudio {
  constructor() {
    this.canvas = document.getElementById("studio-canvas");
    this.ctx = this.canvas.getContext("2d");

    this.configs = window.CharacterConfigs;
    this.activeConfigIndex = 0;
    this.history = [];
    this.historyIndex = -1;
    this.isRestoring = false;
    this.fileHandle = null;

    this.select = document.getElementById("char-select");
    this.hitboxType = document.getElementById("hitboxType");
    this.saveBtn = document.getElementById("save-config-btn");

    this.controls = {
      hitboxWidth: document.getElementById("hitboxWidth"),
      hitboxHeight: document.getElementById("hitboxHeight"),
      hitboxRadius: document.getElementById("hitboxRadius"),
      imageScale: document.getElementById("imageScale"),
      imageOffsetX: document.getElementById("imageOffsetX"),
      imageOffsetY: document.getElementById("imageOffsetY"),
      healthBarOffsetX: document.getElementById("healthBarOffsetX"),
      healthBarOffsetY: document.getElementById("healthBarOffsetY"),
      weaponScale: document.getElementById("weaponScale"),
      weaponOffsetX: document.getElementById("weaponOffsetX"),
      weaponOffsetY: document.getElementById("weaponOffsetY"),
    };

    this.labels = {
      hitboxWidth: document.getElementById("val-hitboxWidth"),
      hitboxHeight: document.getElementById("val-hitboxHeight"),
      hitboxRadius: document.getElementById("val-hitboxRadius"),
      imageScale: document.getElementById("val-imageScale"),
      imageOffsetX: document.getElementById("val-imageOffsetX"),
      imageOffsetY: document.getElementById("val-imageOffsetY"),
      healthBarOffsetX: document.getElementById("val-healthBarOffsetX"),
      healthBarOffsetY: document.getElementById("val-healthBarOffsetY"),
      weaponScale: document.getElementById("val-weaponScale"),
      weaponOffsetX: document.getElementById("val-weaponOffsetX"),
      weaponOffsetY: document.getElementById("val-weaponOffsetY"),
    };

    this.images = {
      body: new Image(),
      weaponIdle: new Image(),
      weaponAttack: new Image(),
    };

    this._init();
  }

  _init() {
    this.configs.forEach((cfg, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = cfg.name;
      this.select.appendChild(option);
    });

    this.select.addEventListener("change", (event) => {
      this.activeConfigIndex = Number.parseInt(event.target.value, 10);
      this._loadCurrentConfig();
    });

    this.hitboxType.addEventListener("change", () => {
      if (this.isRestoring) return;
      this._updateConfigFromInputs();
      this._syncHitboxControlState();
      this._draw();
      this._saveState();
    });

    Object.keys(this.controls).forEach((key) => {
      this.controls[key].addEventListener("input", () => {
        if (this.isRestoring) return;
        this._updateConfigFromInputs();
        this._draw();
      });

      this.controls[key].addEventListener("change", () => {
        if (this.isRestoring) return;
        this._saveState();
      });
    });

    window.addEventListener("keydown", (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;

      if (event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        this.undo();
      } else if (event.key === "y" || (event.key === "Z" && event.shiftKey)) {
        event.preventDefault();
        this.redo();
      }
    });

    this.saveBtn.addEventListener("click", async () => {
      if (!this.fileHandle) {
        try {
          [this.fileHandle] = await window.showOpenFilePicker({
            types: [
              {
                description: "JavaScript Files",
                accept: { "text/javascript": [".js"] },
              },
            ],
            multiple: false,
          });
          this.saveBtn.textContent = "Auto-Saving Active";
          this.saveBtn.style.background = "#4caf50";
          this.saveBtn.style.color = "#fff";
        } catch (error) {
          console.warn("File selection canceled or failed:", error);
          return;
        }
      }

      this._saveToLocalFile();
    });

    this.images.body.onload = () => this._draw();
    this.images.weaponIdle.onload = () => this._draw();
    this.images.weaponAttack.onload = () => this._draw();

    this._loadCurrentConfig();
  }

  _currentConfig() {
    return this.configs[this.activeConfigIndex];
  }

  _ensureConfigShape(config) {
    config.imageScale ??= 1;
    config.imageOffset ??= { x: 0, y: 0 };
    config.healthBarOffset ??= { x: 0, y: 0 };
    config.weaponScale ??= 1;
    config.weaponOffset ??= { x: 0, y: 0 };
    config.hitbox ??= { type: "box", width: 44, height: 88 };

    if (config.hitbox.type === "box") {
      config.hitbox.width ??= 44;
      config.hitbox.height ??= 88;
    } else {
      config.hitbox.type = "circle";
      config.hitbox.radius ??= config.radius ?? 30;
    }
  }

  _loadCurrentConfig() {
    const config = this._currentConfig();
    this._ensureConfigShape(config);

    this.hitboxType.value = config.hitbox.type;
    this.controls.hitboxWidth.value = config.hitbox.width ?? 44;
    this.controls.hitboxHeight.value = config.hitbox.height ?? 88;
    this.controls.hitboxRadius.value =
      config.hitbox.radius ?? config.radius ?? 30;
    this.controls.imageScale.value = config.imageScale;
    this.controls.imageOffsetX.value = config.imageOffset.x;
    this.controls.imageOffsetY.value = config.imageOffset.y;
    this.controls.healthBarOffsetX.value = config.healthBarOffset.x;
    this.controls.healthBarOffsetY.value = config.healthBarOffset.y;
    this.controls.weaponScale.value = config.weaponScale;
    this.controls.weaponOffsetX.value = config.weaponOffset.x;
    this.controls.weaponOffsetY.value = config.weaponOffset.y;

    this.images.body.src = "../../" + (config.image || "");
    this.images.weaponIdle.src = "../../" + (config.weaponIdle || "");
    this.images.weaponAttack.src = "../../" + (config.weaponAttack || "");

    this._syncHitboxControlState();
    this._refreshLabels();
    this._draw();

    this.history = [];
    this.historyIndex = -1;
    this._saveState();
  }

  _syncHitboxControlState() {
    const isBox = this.hitboxType.value === "box";
    this.controls.hitboxWidth.disabled = !isBox;
    this.controls.hitboxHeight.disabled = !isBox;
    this.controls.hitboxRadius.disabled = isBox;
  }

  _refreshLabels() {
    Object.keys(this.labels).forEach((key) => {
      this.labels[key].textContent = this.controls[key].value;
    });
  }

  _snapshotCurrentState() {
    const config = this._currentConfig();
    return JSON.stringify({
      hitbox: { ...config.hitbox },
      imageScale: config.imageScale,
      imageOffset: { ...config.imageOffset },
      healthBarOffset: { ...config.healthBarOffset },
      weaponScale: config.weaponScale,
      weaponOffset: { ...config.weaponOffset },
    });
  }

  _saveState() {
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(this._snapshotCurrentState());
    this.historyIndex += 1;
    this._saveToLocalFile();
  }

  async _saveToLocalFile() {
    if (!this.fileHandle) return;

    try {
      const writable = await this.fileHandle.createWritable();
      const content = `window.CharacterConfigs = ${JSON.stringify(this.configs, null, 2)};\n`;
      await writable.write(content);
      await writable.close();
    } catch (error) {
      console.error("Failed to write to file:", error);
    }
  }

  undo() {
    if (this.historyIndex <= 0) return;
    this.historyIndex -= 1;
    this._restoreState(this.history[this.historyIndex]);
    this._saveToLocalFile();
  }

  redo() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex += 1;
    this._restoreState(this.history[this.historyIndex]);
    this._saveToLocalFile();
  }

  _restoreState(stateString) {
    this.isRestoring = true;
    const state = JSON.parse(stateString);
    const config = this._currentConfig();

    config.hitbox = { ...state.hitbox };
    config.imageScale = state.imageScale;
    config.imageOffset = { ...state.imageOffset };
    config.healthBarOffset = { ...state.healthBarOffset };
    config.weaponScale = state.weaponScale;
    config.weaponOffset = { ...state.weaponOffset };

    this.hitboxType.value = config.hitbox.type;
    this.controls.hitboxWidth.value = config.hitbox.width ?? 44;
    this.controls.hitboxHeight.value = config.hitbox.height ?? 88;
    this.controls.hitboxRadius.value =
      config.hitbox.radius ?? config.radius ?? 30;
    this.controls.imageScale.value = config.imageScale;
    this.controls.imageOffsetX.value = config.imageOffset.x;
    this.controls.imageOffsetY.value = config.imageOffset.y;
    this.controls.healthBarOffsetX.value = config.healthBarOffset.x;
    this.controls.healthBarOffsetY.value = config.healthBarOffset.y;
    this.controls.weaponScale.value = config.weaponScale;
    this.controls.weaponOffsetX.value = config.weaponOffset.x;
    this.controls.weaponOffsetY.value = config.weaponOffset.y;

    this._syncHitboxControlState();
    this._refreshLabels();
    this._draw();
    this.isRestoring = false;
  }

  _updateConfigFromInputs() {
    const config = this._currentConfig();
    const hitboxType = this.hitboxType.value;

    config.hitbox =
      hitboxType === "box"
        ? {
            type: "box",
            width: Number.parseInt(this.controls.hitboxWidth.value, 10),
            height: Number.parseInt(this.controls.hitboxHeight.value, 10),
          }
        : {
            type: "circle",
            radius: Number.parseInt(this.controls.hitboxRadius.value, 10),
          };

    config.imageScale = Number.parseFloat(this.controls.imageScale.value);
    config.imageOffset = {
      x: Number.parseInt(this.controls.imageOffsetX.value, 10),
      y: Number.parseInt(this.controls.imageOffsetY.value, 10),
    };
    config.healthBarOffset = {
      x: Number.parseInt(this.controls.healthBarOffsetX.value, 10),
      y: Number.parseInt(this.controls.healthBarOffsetY.value, 10),
    };
    config.weaponScale = Number.parseFloat(this.controls.weaponScale.value);
    config.weaponOffset = {
      x: Number.parseInt(this.controls.weaponOffsetX.value, 10),
      y: Number.parseInt(this.controls.weaponOffsetY.value, 10),
    };

    this._refreshLabels();
  }

  _drawHitboxOutline(config, centerX, centerY) {
    this.ctx.save();
    this.ctx.strokeStyle = "rgba(255, 0, 0, 0.75)";
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([8, 6]);

    if (config.hitbox.type === "box") {
      const width = config.hitbox.width;
      const height = config.hitbox.height;
      this.ctx.strokeRect(
        centerX - width / 2,
        centerY - height / 2,
        width,
        height,
      );
    } else {
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, config.hitbox.radius, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  _tracePlusPath(x, y, size) {
    const unit = size / 3;
    this.ctx.beginPath();
    this.ctx.moveTo(x + unit, y);
    this.ctx.lineTo(x + unit * 2, y);
    this.ctx.lineTo(x + unit * 2, y + unit);
    this.ctx.lineTo(x + size, y + unit);
    this.ctx.lineTo(x + size, y + unit * 2);
    this.ctx.lineTo(x + unit * 2, y + unit * 2);
    this.ctx.lineTo(x + unit * 2, y + size);
    this.ctx.lineTo(x + unit, y + size);
    this.ctx.lineTo(x + unit, y + unit * 2);
    this.ctx.lineTo(x, y + unit * 2);
    this.ctx.lineTo(x, y + unit);
    this.ctx.lineTo(x + unit, y + unit);
    this.ctx.closePath();
  }

  _draw() {
    const ctx = this.ctx;
    const config = this._currentConfig();
    this._ensureConfigShape(config);

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const radius = config.radius ?? 30;

    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, this.canvas.height);
    ctx.moveTo(0, centerY);
    ctx.lineTo(this.canvas.width, centerY);
    ctx.stroke();

    this._drawHitboxOutline(config, centerX, centerY);

    if (this.images.body.complete && this.images.body.naturalWidth > 0) {
      const drawRadius = radius * config.imageScale;
      ctx.save();
      ctx.translate(
        centerX + config.imageOffset.x,
        centerY + config.imageOffset.y,
      );
      ctx.drawImage(
        this.images.body,
        -drawRadius,
        -drawRadius,
        drawRadius * 2,
        drawRadius * 2,
      );
      ctx.restore();
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = config.color;
      ctx.fill();
      ctx.restore();
    }

    if (
      this.images.weaponIdle.complete &&
      this.images.weaponIdle.naturalWidth > 0
    ) {
      const weaponRadius = radius * config.weaponScale;
      ctx.save();
      ctx.translate(
        centerX + config.weaponOffset.x,
        centerY + config.weaponOffset.y,
      );
      ctx.drawImage(
        this.images.weaponIdle,
        -weaponRadius,
        -weaponRadius,
        weaponRadius * 2,
        weaponRadius * 2,
      );
      ctx.restore();
    }

    const plusSize = radius * 1.65;
    const plusX = centerX - plusSize / 2 + config.healthBarOffset.x;
    const plusY = centerY - radius - 20 + config.healthBarOffset.y;

    ctx.save();
    this._tracePlusPath(plusX, plusY, plusSize);
    ctx.fillStyle = "#222222";
    ctx.fill();

    ctx.save();
    this._tracePlusPath(plusX, plusY, plusSize);
    ctx.clip();
    ctx.fillStyle = "hsl(120, 90%, 40%)";
    ctx.fillRect(plusX, plusY, plusSize, plusSize);
    ctx.restore();

    this._tracePlusPath(plusX, plusY, plusSize);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    const indicatorCfg = window.IndicatorConfig;
    const textCfg = indicatorCfg.text;
    const fontSize = Math.max(
      indicatorCfg.health.minFontSize,
      plusSize * indicatorCfg.health.sizeMultiplier,
    );
    const healthText = String(config.maxHealth ?? 100);
    ctx.fillStyle = textCfg.fillColor;
    ctx.strokeStyle = textCfg.strokeColor;
    ctx.lineWidth = textCfg.strokeWidth;
    ctx.font = `${textCfg.weight} ${fontSize}px ${textCfg.family}`;
    ctx.textAlign = textCfg.align;
    ctx.textBaseline = textCfg.baseline;
    ctx.strokeText(healthText, plusX + plusSize / 2, plusY + plusSize / 2);
    ctx.fillText(healthText, plusX + plusSize / 2, plusY + plusSize / 2);
    ctx.restore();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new CharacterStudio();
});
