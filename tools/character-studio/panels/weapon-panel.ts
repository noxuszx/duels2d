import type { FighterComponents } from "../../../src/types/fighter";
import type { MeleeSettings } from "../../../src/config/component-settings";
type AttackHitbox = NonNullable<MeleeSettings["hitbox"]>;
type Swing = NonNullable<MeleeSettings["swing"]>;
import type { NumericInput } from "../app/editor-types";
import { requireElement } from "../ui/dom";

export interface WeaponPanelHost {
      _editingComponents(): FighterComponents;
      _swingAction(): Swing | null;
      _attackHitboxAction(): AttackHitbox | null;
      _syncAttackHitboxControls(): void;
      meleeComponentSelect: HTMLSelectElement;
      controls: Record<
            | "weaponScale"
            | "weaponOffsetX"
            | "weaponOffsetY"
            | "weaponPivotX"
            | "weaponPivotY"
            | "swingStartDegrees"
            | "swingEndDegrees"
            | "attackHitboxOffsetX"
            | "attackHitboxOffsetY"
            | "attackHitboxWidth"
            | "attackHitboxHeight",
            NumericInput
      >;
}

export function _swingAction(host: WeaponPanelHost): Swing | null {
      return host._editingComponents().melee?.swing ?? null;
}

export function _attackHitboxAction(host: WeaponPanelHost): AttackHitbox | null {
      return host._editingComponents().melee?.hitbox ?? null;
}

export function _populateAttackHitboxSelect(host: WeaponPanelHost): void {
      const hasAttackHitbox = Boolean(host._attackHitboxAction());
      host.meleeComponentSelect.replaceChildren();
      if (hasAttackHitbox) host.meleeComponentSelect.add(new Option("Melee", "melee"));
      requireElement<HTMLElement>("attack-hitbox-controls").hidden = !hasAttackHitbox;
      requireElement<HTMLElement>("no-attack-hitbox-message").hidden = hasAttackHitbox;
      host._syncAttackHitboxControls();
}

export function _syncAttackHitboxControls(host: WeaponPanelHost): void {
      const action = host._attackHitboxAction();
      if (action) {
            for (const [key, value] of [
                  ["attackHitboxOffsetX", action.offset.x],
                  ["attackHitboxOffsetY", action.offset.y],
            ] as const) {
                  host.controls[key].min = String(Math.min(-250, value));
                  host.controls[key].max = String(Math.max(250, value));
            }
      }
      host.controls.attackHitboxWidth.value = action?.width ?? 40;
      host.controls.attackHitboxHeight.value = action?.height ?? 100;
      host.controls.attackHitboxOffsetX.value = action?.offset.x ?? 40;
      host.controls.attackHitboxOffsetY.value = action?.offset.y ?? 0;
      for (const key of [
            "attackHitboxWidth",
            "attackHitboxHeight",
            "attackHitboxOffsetX",
            "attackHitboxOffsetY",
      ] as const) {
            host.controls[key].disabled = !action;
      }
}

export function _syncSwingControls(host: WeaponPanelHost): void {
      const action = host._swingAction();
      host.controls.swingStartDegrees.disabled = !action;
      host.controls.swingEndDegrees.disabled = !action;
      host.controls.swingStartDegrees.value = action?.startDegrees ?? 0;
      host.controls.swingEndDegrees.value = action?.endDegrees ?? 0;
}
