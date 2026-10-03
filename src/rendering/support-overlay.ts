import type { ViewportBounds } from "../gameplay/spawned-entity";

/** Viewport presentation in arena world coordinates; never owns a gameplay clock. */
export class SupportOverlay {
      private readonly canvas = document.createElement("canvas");
      private readonly ctx: CanvasRenderingContext2D;

      constructor(private readonly arenaCanvas: HTMLCanvasElement, private readonly scale: number) {
            const ctx = this.canvas.getContext("2d");
            if (!ctx) throw new Error("Support canvas cannot render");
            this.ctx = ctx;
            this.canvas.setAttribute("aria-hidden", "true");
            Object.assign(this.canvas.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "10" });
            document.body.append(this.canvas);
      }

      getViewport(): ViewportBounds {
            const rect = this.arenaCanvas.getBoundingClientRect();
            return { left: -rect.left, right: window.innerWidth - rect.left,
                  top: -rect.top, bottom: window.innerHeight - rect.top };
      }

      draw(draw: (ctx: CanvasRenderingContext2D) => void): void {
            const width = window.innerWidth, height = window.innerHeight;
            const pixelWidth = Math.round(width * this.scale), pixelHeight = Math.round(height * this.scale);
            if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
                  this.canvas.width = pixelWidth; this.canvas.height = pixelHeight;
                  this.canvas.style.width = `${width}px`; this.canvas.style.height = `${height}px`;
            }
            this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
            this.ctx.clearRect(0, 0, width, height);
            const rect = this.arenaCanvas.getBoundingClientRect();
            this.ctx.save();
            // Arena-visible support art is drawn into the recording canvas itself.
            this.ctx.beginPath();
            this.ctx.rect(0, 0, width, height);
            this.ctx.rect(rect.left, rect.top, rect.width, rect.height);
            this.ctx.clip("evenodd");
            this.ctx.translate(rect.left, rect.top);
            draw(this.ctx);
            this.ctx.restore();
      }
}
