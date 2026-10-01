import type { FighterConfig } from "../../../src/types/fighter";
import type {
      AttackHitboxAction,
      SwingAction,
} from "../../../src/abilities/types";
import type { NumericInput } from "../app/editor-types";
import { requireElement } from "../ui/dom";

export interface WeaponPanelHost {
      _editingAbilities(): FighterConfig["abilities"];
      _swingAction(): SwingAction | null;
      _attackHitboxAction(): AttackHitboxAction | null;
      _syncAttackHitboxControls(): void;
      attackHitboxAbilitySelect: HTMLSelectElement;
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

export function _swingAction(host: WeaponPanelHost): SwingAction | null {
      for (const ability of host._editingAbilities()) {
            const action = ability.actions.find(
                  (candidate) => candidate.type === "swing",
            );
            if (action?.type === "swing") return action;
      }
      return null;
}

export function _attackHitboxAction(
      host: WeaponPanelHost,
): AttackHitboxAction | null {
      const abilityId = host.attackHitboxAbilitySelect.value;
      const ability = host
            ._editingAbilities()
            .find((candidate) => candidate.id === abilityId);
      return (
            ability?.actions.find(
                  (candidate): candidate is AttackHitboxAction =>
                        candidate.type === "attack-hitbox",
            ) ?? null
      );
}

export function _populateAttackHitboxSelect(host: WeaponPanelHost): void {
      const previous = host.attackHitboxAbilitySelect.value;
      const abilities = host
            ._editingAbilities()
            .filter((ability) =>
                  ability.actions.some(
                        (action) => action.type === "attack-hitbox",
                  ),
            );
      host.attackHitboxAbilitySelect.replaceChildren();
      for (const ability of abilities) {
            const option = document.createElement("option");
            option.value = ability.id;
            option.textContent = ability.id;
            host.attackHitboxAbilitySelect.appendChild(option);
      }
      if (abilities.some((ability) => ability.id === previous)) {
            host.attackHitboxAbilitySelect.value = previous;
      }
      const hasAttackHitbox = abilities.length > 0;
      requireElement<HTMLElement>("attack-hitbox-controls").hidden =
            !hasAttackHitbox;
      requireElement<HTMLElement>("no-attack-hitbox-message").hidden =
            hasAttackHitbox;
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
