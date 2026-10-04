import type { ProjectileEmitterSettings } from "../../../src/config/component-settings";

export interface PreviewAnimationHost {
      projectilePreviewTime: number;
      projectilePreviewAngle: number;
      _projectileAction(): ProjectileEmitterSettings | null;
      _draw(): void;
}

/** Own the preview clock separately from document editing and return cleanup. */
export function installPreviewAnimation(
      host: PreviewAnimationHost,
): () => void {
      let disposed = false;
      let frame: number;
      const animate = (now: number) => {
            if (disposed) return;
            const elapsedFrames = Math.max(
                  0,
                  Math.min((now - host.projectilePreviewTime) / (1000 / 60), 4),
            );
            host.projectilePreviewTime = now;
            const action = host._projectileAction();
            const rotationSpeed = action?.projectile.rotationSpeed ?? 0;
            if (rotationSpeed !== 0) {
                  host.projectilePreviewAngle += rotationSpeed * elapsedFrames;
                  host._draw();
            }
            frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
      return () => {
            disposed = true;
            cancelAnimationFrame(frame);
      };
}
