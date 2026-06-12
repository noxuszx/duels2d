"use strict";

class IndicatorSystem {
  constructor() {
    this.damageIndicators = [];
    this.dialogueIndicators = [];
    this.hitSparks = [];
  }

  spawnDamageIndicator(char, amount) {
    const pos = char.visualPosition;
    const cfg = window.IndicatorConfig.damage;
    this.damageIndicators.push({
      text: `-${amount}`,
      x: pos.x + (Math.random() - 0.5) * char.radius,
      y: pos.y - char.hitbox.halfHeight * 0.35,
      vy: cfg.driftY,
      life: 1,
      fontSize: Math.max(cfg.minFontSize, char.radius * cfg.sizeMultiplier),
    });
  }

  spawnDialogueIndicator(character, text) {
    const pos = character.visualPosition;
    const cfg = window.IndicatorConfig.dialogue;
    this.dialogueIndicators.push({
      text,
      x: pos.x,
      y: pos.y - character.hitbox.halfHeight * (cfg.offsetYMultiplier ?? 1),
      vy: cfg.driftY,
      life: 1,
      fontSize: Math.max(
        cfg.minFontSize,
        character.radius * cfg.sizeMultiplier,
      ),
    });
  }

  spawnCharacterLine(character, type) {
    const line = character.getRandomLine(type);
    if (!line) return;
    this.spawnDialogueIndicator(character, line);
  }

  spawnHitSpark(pos, color) {
    if (window.GameConfig.effects?.hitSpark === false) return;

    const count = 6;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 2 + Math.random() * 2;
      this.hitSparks.push({
        x: pos.x,
        y: pos.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.12 + Math.random() * 0.04,
        color,
      });
    }
  }

  updateIndicators(indicators, config) {
    for (let i = indicators.length - 1; i >= 0; i--) {
      const indicator = indicators[i];
      indicator.y += indicator.vy;
      indicator.vy *= config.velocityDamping;
      indicator.life -= config.fadeRate;
      if (indicator.life <= 0) indicators.splice(i, 1);
    }
  }

  updateDamageIndicators() {
    this.updateIndicators(
      this.damageIndicators,
      window.IndicatorConfig.damage,
    );
  }

  updateDialogueIndicators() {
    this.updateIndicators(
      this.dialogueIndicators,
      window.IndicatorConfig.dialogue,
    );
  }

  updateHitSparks() {
    for (let i = this.hitSparks.length - 1; i >= 0; i--) {
      const spark = this.hitSparks[i];
      spark.x += spark.vx;
      spark.y += spark.vy;
      spark.vx *= 0.92;
      spark.vy *= 0.92;
      spark.life -= spark.decay;
      if (spark.life <= 0) this.hitSparks.splice(i, 1);
    }
  }

  drawFloatingTextIndicators(ctx, indicators, config) {
    const baseText = window.IndicatorConfig.text;
    indicators.forEach((indicator) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, indicator.life);
      ctx.fillStyle = config.fillColor;
      ctx.strokeStyle = config.strokeColor;
      ctx.lineWidth = config.strokeWidth;
      ctx.font = `${baseText.weight} ${indicator.fontSize}px ${baseText.family}`;
      ctx.textAlign = baseText.align;
      ctx.textBaseline = baseText.baseline;
      ctx.strokeText(indicator.text, indicator.x, indicator.y);
      ctx.fillText(indicator.text, indicator.x, indicator.y);
      ctx.restore();
    });
  }

  drawDamageIndicators(ctx) {
    this.drawFloatingTextIndicators(
      ctx,
      this.damageIndicators,
      window.IndicatorConfig.damage,
    );
  }

  drawDialogueIndicators(ctx) {
    this.drawFloatingTextIndicators(
      ctx,
      this.dialogueIndicators,
      window.IndicatorConfig.dialogue,
    );
  }

  drawHitSparks(ctx) {
    this.hitSparks.forEach((spark) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, spark.life);
      ctx.strokeStyle = spark.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(spark.x, spark.y);
      ctx.lineTo(spark.x - spark.vx * 2, spark.y - spark.vy * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  reset() {
    this.damageIndicators = [];
    this.dialogueIndicators = [];
    this.hitSparks = [];
  }
}
