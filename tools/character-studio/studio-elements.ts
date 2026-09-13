import type { NumericInput } from "./studio-types";

export const requireElement = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required studio element: #${id}`);
  return element as T;
};

export const numberValue = (input: NumericInput): number =>
  Number.parseFloat(String(input.value));
