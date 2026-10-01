import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { composeFighter } from "../../../src/config/fighter-config";
import type { StudioConfig } from "../app/editor-types";
import { EditorSession, restoreStudioState } from "../app/editor-session";
import { getSaveContent } from "../persistence/fighter-serializer";

function fixture() {
      const defaults = JSON.parse(
            readFileSync("config/fighters/defaults.json", "utf8"),
      );
      const definition = JSON.parse(
            readFileSync("config/fighters/granny.json", "utf8"),
      );
      return {
            defaults,
            definition,
            config: composeFighter(defaults, definition) as StudioConfig,
      };
}

describe("EditorSession", () => {
      it("keeps independent fighter undo stacks and drops redo after a new edit", () => {
            const { config } = fixture();
            const other = structuredClone(config);
            other.id = "other";
            const session = new EditorSession([config, other]);
            session.resetHistory();
            const original = config.imageScale;
            config.imageScale = 2;
            session.commit();
            session.activeConfigIndex = 1;
            session.resetHistory();
            other.imageScale = 3;
            session.commit();
            session.activeConfigIndex = 0;
            expect(session.undo()).not.toBeNull();
            expect(config.imageScale).toBe(original);
            expect(other.imageScale).toBe(3);
            config.imageScale = 4;
            session.commit();
            expect(session.redo()).toBeNull();
            expect(session.commit()).toBe(false);
      });
      it("restores null pose banks and cancels uncommitted drafts", () => {
            const { config } = fixture();
            config.poses = null;
            const session = new EditorSession([config]);
            session.resetHistory();
            config.poses = { idle: "some.png" };
            session.commit();
            session.mode = "crop";
            session.cropDraft = { x: 1, y: 1, width: 10, height: 10 };
            session.undo();
            expect(config.poses).toBeNull();
            expect(session.mode).toBe("default");
            expect(session.cropDraft).toBeNull();
            expect(session.redo()).not.toBeNull();
            expect(config.poses).toEqual({ idle: "some.png" });
      });
      it("undo clears optional fields absent from the baseline snapshot", () => {
            const { config } = fixture();
            delete config.skills;
            delete config.weaponIdle;
            const session = new EditorSession([config]);
            session.resetHistory();
            config.skills = { aim: { muzzle: { x: 10, y: 20 } } };
            config.weaponIdle = "weapon.png";
            session.commit();
            session.undo();
            expect(config.skills).toBeUndefined();
            expect(config.weaponIdle).toBeUndefined();
            session.redo();
            expect(config.skills?.aim?.muzzle).toEqual({ x: 10, y: 20 });
            expect(config.weaponIdle).toBe("weapon.png");
      });
      it("does not record selection-only changes or remove the redo branch", () => {
            const { config } = fixture();
            const session = new EditorSession([config]);
            session.resetHistory();
            config.imageScale = 9;
            session.commit();
            session.undo();
            session.activePoseKey = "attack";
            session.activeForm = "transformed";
            expect(session.commit()).toBe(false);
            expect(session.history).toHaveLength(2);
            expect(session.redo()).not.toBeNull();
            expect(config.imageScale).toBe(9);
      });
      it("restores purely without modifying its input", () => {
            const { config } = fixture();
            const session = new EditorSession([config]);
            session.resetHistory();
            config.imageScale = 10;
            const restored = restoreStudioState(config, session.history[0]);
            expect(config.imageScale).toBe(10);
            expect(restored.config.imageScale).not.toBe(10);
            expect(restored.config.abilities).not.toBe(config.abilities);
      });
      it("serializes without changing source fighter definitions", () => {
            const { config, definition, defaults } = fixture();
            const before = structuredClone(definition);
            config.imageScale = 5;
            expect(
                  JSON.parse(getSaveContent([definition], config, defaults))
                        .presentation.imageScale,
            ).toBe(5);
            expect(definition).toEqual(before);
      });
});
