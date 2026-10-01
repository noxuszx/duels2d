import type { SpawnProjectileAction } from "../../../src/abilities/types";
import type { FighterConfig } from "../../../src/types/fighter";
import { requireElement } from "../ui/dom";

export interface ProjectilePanelHost {
      _editingAbilities(): FighterConfig["abilities"];
      _projectileAction(): SpawnProjectileAction | null;
      _projectileImages(): string[];
      _loadProjectilePreview(): void;
      _syncProjectileControls(): void;
      projectileImageSelect: HTMLSelectElement;
      projectileImageScale: HTMLInputElement;
      projectileRotationSpeed: HTMLInputElement;
      projectilePreviewAngle: number;
      images: { projectile: HTMLImageElement };
}

export function _projectileAction(
      host: ProjectilePanelHost,
): SpawnProjectileAction | null {
      for (const ability of host._editingAbilities()) {
            const action = ability.actions.find(
                  (candidate) => candidate.type === "spawn-projectile",
            );
            if (action?.type === "spawn-projectile") return action;
      }
      return null;
}

export function _projectileImages(host: ProjectilePanelHost): string[] {
      const action = host._projectileAction();
      if (!action) return [];
      return Array.isArray(action.projectile.image)
            ? action.projectile.image
            : [action.projectile.image];
}

export function _populateProjectileSelect(host: ProjectilePanelHost): void {
      const images = host._projectileImages();
      const previous = host.projectileImageSelect.value;
      host.projectileImageSelect.replaceChildren();
      images.forEach((path) => {
            const option = document.createElement("option");
            option.value = path;
            option.textContent = path.split("/").pop() ?? path;
            option.title = path;
            host.projectileImageSelect.appendChild(option);
      });
      if (images.includes(previous))
            host.projectileImageSelect.value = previous;
      const hasProjectile = images.length > 0;
      requireElement<HTMLElement>("projectile-controls").hidden =
            !hasProjectile;
      requireElement<HTMLElement>("no-projectile-message").hidden =
            hasProjectile;
      host._loadProjectilePreview();
      host._syncProjectileControls();
}

export function _loadProjectilePreview(host: ProjectilePanelHost): void {
      const path = host.projectileImageSelect.value;
      if (path) host.images.projectile.src = "../../" + path;
      else host.images.projectile.removeAttribute("src");
      host.projectilePreviewAngle = 0;
}

export function _syncProjectileControls(host: ProjectilePanelHost): void {
      const action = host._projectileAction();
      const path = host.projectileImageSelect.value;
      const enabled = Boolean(action && path);
      host.projectileImageScale.disabled = !enabled;
      host.projectileRotationSpeed.disabled = !enabled;
      if (!action) return;
      host.projectileImageScale.value = String(
            action.projectile.imageScales?.[path] ?? 1,
      );
      host.projectileRotationSpeed.value = String(
            action.projectile.rotationSpeed ?? 0,
      );
      requireElement<HTMLElement>("val-projectileImageScale").textContent =
            Number(host.projectileImageScale.value).toFixed(2);
      requireElement<HTMLElement>("val-projectileRotationSpeed").textContent =
            Number(host.projectileRotationSpeed.value).toFixed(2);
}

export function _updateProjectileConfig(host: ProjectilePanelHost): void {
      const action = host._projectileAction();
      const path = host.projectileImageSelect.value;
      if (!action || !path) return;
      action.projectile.imageScales ??= {};
      action.projectile.imageScales[path] = Number(
            host.projectileImageScale.value,
      );
      action.projectile.rotationSpeed = Number(
            host.projectileRotationSpeed.value,
      );
      host._syncProjectileControls();
}
