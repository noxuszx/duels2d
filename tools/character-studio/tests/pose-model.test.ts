import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { composeFighter } from "../../../src/config/fighter-config";
import type { StudioConfig } from "../app/editor-types";
import { createTransformation, poseBank } from "../document/form-model";
import {
      _getPoseConfig,
      _getPoseImagePath,
      _getPoseVisual,
      _setPoseVisual,
      type PoseModelHost,
} from "../document/pose-model";

function fixture() {
      const defaults = JSON.parse(
            readFileSync("config/fighters/defaults.json", "utf8"),
      );
      const definition = JSON.parse(
            readFileSync("config/fighters/granny.json", "utf8"),
      );
      return composeFighter(defaults, definition) as StudioConfig;
}

describe("pose model", () => {
      it("reading missing poses preserves null banks in both forms", () => {
            const config = fixture();
            config.poses = null;
            config.transformation = createTransformation(config);
            config.transformation.poses = null;
            for (const activeForm of ["base", "transformed"] as const) {
                  const host: PoseModelHost = {
                        activeForm,
                        _poseBank: (document = config) =>
                              poseBank(document, activeForm),
                        _getPoseImagePath: (document, key) =>
                              _getPoseImagePath(host, document, key),
                  };
                  expect(_getPoseConfig(host, config, "idle")).toBeUndefined();
                  expect(_getPoseImagePath(host, config, "idle")).toBe(
                        config.image,
                  );
                  expect(_getPoseVisual(host, config, "idle").imageScale).toBe(
                        config.imageScale,
                  );
            }
            expect(config.poses).toBeNull();
            expect(config.transformation.poses).toBeNull();
      });
      it("explicit pose edits initialize only the selected form's bank", () => {
            const config = fixture();
            config.poses = null;
            config.transformation = createTransformation(config);
            config.transformation.poses = null;
            const host: PoseModelHost = {
                  activeForm: "transformed",
                  _poseBank: (document = config) =>
                        poseBank(document, "transformed"),
                  _getPoseImagePath: (document, key) =>
                        _getPoseImagePath(host, document, key),
            };
            _setPoseVisual(host, config, "idle", { imageScale: 2 });
            expect(config.poses).toBeNull();
            expect(config.transformation.poses).toEqual({
                  idle: { image: config.image, imageScale: 2 },
            });
      });
});
