import type { Fighter } from "../entities/fighter";
import type { GameConfig, IndicatorConfig } from "../types/game";

type Point = { x: number; y: number };
type FloatingIndicator = {
      text: string;
      x: number;
      y: number;
      vy: number;
      life: number;
      fontSize: number;
};
type HitSpark = Point & {
      vx: number;
      vy: number;
      life: number;
      decay: number;
      color: string;
};
type FloatingIndicatorConfig = {
      fillColor: string;
      strokeColor: string;
      strokeWidth: number;
      minFontSize: number;
      sizeMultiplier: number;
      driftY: number;
      velocityDamping: number;
      fadeRate: number;
      offsetYMultiplier?: number;
};

export class IndicatorSystem {
      constructor(
            private readonly gameConfig: GameConfig,
            private readonly indicatorConfig: IndicatorConfig,
      ) {}

      damageIndicators: FloatingIndicator[] = [];
      dialogueIndicators: FloatingIndicator[] = [];
      hitSparks: HitSpark[] = [];

      spawnDamageIndicator(character: Fighter, amount: number): void {
            const position = character.visualPosition;
            const config = this.indicatorConfig.damage;
            this.damageIndicators.push({
                  text: `-${amount}`,
                  x:
                        position.x +
                        (Math.random() - 0.5) * character.config.radius,
                  y: position.y - character.hitbox.halfHeight * 0.35,
                  vy: config.driftY,
                  life: 1,
                  fontSize: Math.max(
                        config.minFontSize,
                        character.config.radius * config.sizeMultiplier,
                  ),
            });
      }

      spawnDialogueIndicator(character: Fighter, text: string): void {
            const position = character.visualPosition;
            const config = this.indicatorConfig.dialogue;
            this.dialogueIndicators.push({
                  text,
                  x: position.x,
                  y:
                        position.y -
                        character.hitbox.halfHeight *
                              (config.offsetYMultiplier ?? 1),
                  vy: config.driftY,
                  life: 1,
                  fontSize: Math.max(
                        config.minFontSize,
                        character.config.radius * config.sizeMultiplier,
                  ),
            });
      }

      spawnCharacterLine(character: Fighter, type: string): void {
            const line = character.getRandomLine(type);
            if (line) this.spawnDialogueIndicator(character, line);
      }

      spawnHitSpark(position: Point, color: string): void {
            if (this.gameConfig.effects?.hitSpark === false) return;
            for (let index = 0; index < 6; index++) {
                  const angle =
                        (Math.PI * 2 * index) / 6 + (Math.random() - 0.5) * 0.5;
                  const speed = 2 + Math.random() * 2;
                  this.hitSparks.push({
                        x: position.x,
                        y: position.y,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        life: 1,
                        decay: 0.12 + Math.random() * 0.04,
                        color,
                  });
            }
      }

      private updateIndicators(
            indicators: FloatingIndicator[],
            config: FloatingIndicatorConfig,
      ): void {
            for (let index = indicators.length - 1; index >= 0; index--) {
                  const indicator = indicators[index];
                  indicator.y += indicator.vy;
                  indicator.vy *= config.velocityDamping;
                  indicator.life -= config.fadeRate;
                  if (indicator.life <= 0) indicators.splice(index, 1);
            }
      }

      updateDamageIndicators(): void {
            this.updateIndicators(
                  this.damageIndicators,
                  this.indicatorConfig.damage,
            );
      }
      updateDialogueIndicators(): void {
            this.updateIndicators(
                  this.dialogueIndicators,
                  this.indicatorConfig.dialogue,
            );
      }
      updateHitSparks(): void {
            for (let index = this.hitSparks.length - 1; index >= 0; index--) {
                  const spark = this.hitSparks[index];
                  spark.x += spark.vx;
                  spark.y += spark.vy;
                  spark.vx *= 0.92;
                  spark.vy *= 0.92;
                  spark.life -= spark.decay;
                  if (spark.life <= 0) this.hitSparks.splice(index, 1);
            }
      }

      private drawFloatingTextIndicators(
            context: CanvasRenderingContext2D,
            indicators: FloatingIndicator[],
            config: FloatingIndicatorConfig,
      ): void {
            const text = this.indicatorConfig.text;
            indicators.forEach((indicator) => {
                  context.save();
                  context.globalAlpha = Math.max(0, indicator.life);
                  context.fillStyle = config.fillColor;
                  context.strokeStyle = config.strokeColor;
                  context.lineWidth = config.strokeWidth;
                  context.font = `${text.weight} ${indicator.fontSize}px ${text.family}`;
                  context.textAlign = text.align;
                  context.textBaseline = text.baseline;
                  context.strokeText(indicator.text, indicator.x, indicator.y);
                  context.fillText(indicator.text, indicator.x, indicator.y);
                  context.restore();
            });
      }

      drawDamageIndicators(context: CanvasRenderingContext2D): void {
            this.drawFloatingTextIndicators(
                  context,
                  this.damageIndicators,
                  this.indicatorConfig.damage,
            );
      }
      drawDialogueIndicators(context: CanvasRenderingContext2D): void {
            this.drawFloatingTextIndicators(
                  context,
                  this.dialogueIndicators,
                  this.indicatorConfig.dialogue,
            );
      }
      drawHitSparks(context: CanvasRenderingContext2D): void {
            this.hitSparks.forEach((spark) => {
                  context.save();
                  context.globalAlpha = Math.max(0, spark.life);
                  context.strokeStyle = spark.color;
                  context.lineWidth = 2;
                  context.beginPath();
                  context.moveTo(spark.x, spark.y);
                  context.lineTo(
                        spark.x - spark.vx * 2,
                        spark.y - spark.vy * 2,
                  );
                  context.stroke();
                  context.restore();
            });
      }

      reset(): void {
            this.damageIndicators = [];
            this.dialogueIndicators = [];
            this.hitSparks = [];
      }
}
