import type { EntityComponent } from "../../../engine/component";
import type { FighterConfig, FighterForm } from "../../../types/fighter";
import type { MoveConfig } from "../../../config/component-settings";
import type { FighterContext } from "../../fighter-factory";

/** Named configuration selection; scripts own thresholds and transition sequences.
 * Equipped handles remain stable. Selecting a form never installs new components.
 */
export class Forms implements EntityComponent {
      private readonly base: FighterConfig;
      private selected: string | null = null;

      constructor(private readonly context: FighterContext) { this.base = context.config; }
      attach(): void {}
      get healthRatio(): number { return this.context.entity.health / this.context.entity.maxHealth; }
      is(name: string): boolean { return this.selected === name; }
      baseMove(id: string): MoveConfig {
            const move = this.base.moves[id];
            if (!move) throw new Error(`${this.base.id}: missing move ${id}`);
            return move;
      }
      settings(name: string): FighterForm {
            const form = this.base.forms[name];
            if (!form) throw new Error(`${this.base.id}: missing form ${name}`);
            return form;
      }
      enter(name: string): void {
            const form = this.settings(name);
            if (!this.context.entity.isAlive) return;
            this.context.entity.setConfiguration({ ...this.base,
                  components: form.components, moves: form.moves, poses: form.poses });
            this.selected = name;
      }
}
