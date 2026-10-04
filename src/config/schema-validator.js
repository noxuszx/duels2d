/** Small validator for the JSON Schema vocabulary used by fighter data.
 * Shared by browser loading, Studio Apply and the CLI; never changes the input.
 */
export function validateSchema(value, schema, root = schema, path = "fighter") {
      const errors = [];
      const visit = (value, rule, path) => {
            if (rule === true) return;
            if (rule === false) { errors.push(`${path}: not allowed`); return; }
            if (rule.$ref) {
                  const target = rule.$ref.split("/").slice(1).reduce((node, part) => node?.[part.replaceAll("~1", "/").replaceAll("~0", "~")], root);
                  if (!target) { errors.push(`${path}: unknown schema ${rule.$ref}`); return; }
                  visit(value, target, path); return;
            }
            for (const keyword of ["oneOf", "anyOf"]) if (rule[keyword]) {
                  const matches = rule[keyword].filter(candidate => validateSchema(value, candidate, root, path).length === 0).length;
                  if (matches === 0 || (keyword === "oneOf" && matches !== 1)) errors.push(`${path}: does not match ${keyword} schema`);
                  return;
            }
            if (rule.const !== undefined && value !== rule.const) errors.push(`${path}: expected ${rule.const}`);
            if (rule.enum && !rule.enum.includes(value)) errors.push(`${path}: expected one of ${rule.enum.join(", ")}`);
            const types = Array.isArray(rule.type) ? rule.type : rule.type ? [rule.type] : [];
            const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
            if (types.length && !types.some(type => type === actual || (type === "integer" && typeof value === "number" && Number.isInteger(value)))) {
                  errors.push(`${path}: expected ${types.join(" or ")}`); return;
            }
            if (typeof value === "number") {
                  if (!Number.isFinite(value)) errors.push(`${path}: must be finite`);
                  if (rule.minimum !== undefined && value < rule.minimum) errors.push(`${path}: minimum ${rule.minimum}`);
                  if (rule.maximum !== undefined && value > rule.maximum) errors.push(`${path}: maximum ${rule.maximum}`);
                  if (rule.exclusiveMinimum !== undefined && value <= rule.exclusiveMinimum) errors.push(`${path}: must exceed ${rule.exclusiveMinimum}`);
            }
            if (typeof value === "string") {
                  if (rule.minLength !== undefined && value.length < rule.minLength) errors.push(`${path}: too short`);
                  if (rule.pattern && !new RegExp(rule.pattern).test(value)) errors.push(`${path}: invalid format`);
            }
            if (Array.isArray(value)) {
                  if (rule.minItems !== undefined && value.length < rule.minItems) errors.push(`${path}: too few items`);
                  if (rule.maxItems !== undefined && value.length > rule.maxItems) errors.push(`${path}: too many items`);
                  if (rule.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) errors.push(`${path}: duplicate items`);
                  if (rule.items) value.forEach((item, index) => visit(item, rule.items, `${path}[${index}]`));
            } else if (value && typeof value === "object") {
                  for (const key of rule.required ?? []) if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: required`);
                  for (const [key, item] of Object.entries(value)) {
                        const property = rule.properties && Object.hasOwn(rule.properties, key) ? rule.properties[key] : undefined;
                        if (property) visit(item, property, `${path}.${key}`);
                        else if (rule.additionalProperties === false) errors.push(`${path}.${key}: unknown field`);
                        else if (rule.additionalProperties && typeof rule.additionalProperties === "object") visit(item, rule.additionalProperties, `${path}.${key}`);
                  }
            }
      };
      visit(value, schema, path);
      return errors;
}
