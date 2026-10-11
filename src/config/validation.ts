import schema from "../../config/fighters/fighter.schema.json" with { type: "json" };
import { validateSchema } from "./schema-validator.js";
import type { FighterDefinition, FighterDefaults } from "../types/fighter.ts";

export function assertFighterDefinition(value: unknown): asserts value is FighterDefinition {
      const errors = validateSchema(value, schema);
      if (errors.length) throw new Error(errors.join("\n"));
}

export function assertFighterDefaults(value: unknown): asserts value is FighterDefaults {
      const errors = validateSchema(value, schema.$defs.defaults, schema, "defaults");
      if (errors.length) throw new Error(errors.join("\n"));
}

/** Validate reusable configuration without mutating the current editor document. */
export function assertComponentData(components: unknown, moves: unknown): void {
      const errors = [
            ...validateSchema(components, schema.$defs.components, schema, "components"),
            ...validateSchema(moves, schema.$defs.moves, schema, "moves"),
      ];
      if (errors.length) throw new Error(errors.join("\n"));
}
