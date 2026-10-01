import { requireElement } from "../ui/dom";
import type { ControlName, NumericInput } from "../app/editor-types";

/** DOM bindings are constructed once and shared with focused panels. */
export class StudioElements {
      canvas: HTMLCanvasElement;
      ctx: CanvasRenderingContext2D;
      select: HTMLSelectElement;
      poseSelect: HTMLSelectElement;
      poseImageSelect: HTMLSelectElement;
      poseImageInput: HTMLInputElement;
      defaultFacingSelect: HTMLSelectElement;
      resetPoseBtn: HTMLButtonElement;
      addPoseBtn: HTMLButtonElement;
      renamePoseBtn: HTMLButtonElement;
      removePoseBtn: HTMLButtonElement;
      poseDialog: HTMLDialogElement;
      poseDialogForm: HTMLFormElement;
      poseDialogTitle: HTMLElement;
      poseDialogKey: HTMLSelectElement;
      poseDialogImageSelect: HTMLSelectElement;
      poseDialogImage: HTMLInputElement;
      poseDialogError: HTMLElement;
      poseDialogMode: "add" | "rename" = "add";
      imageOutput: HTMLInputElement;
      hitboxType: HTMLSelectElement;
      editHitboxBtn: HTMLButtonElement;
      applyHitboxBtn: HTMLButtonElement;
      cancelHitboxBtn: HTMLButtonElement;
      cropBtn: HTMLButtonElement;
      applyCropBtn: HTMLButtonElement;
      cancelCropBtn: HTMLButtonElement;
      saveBtn: HTMLButtonElement;
      hitboxOutput: HTMLInputElement;
      attackHitboxAbilitySelect: HTMLSelectElement;
      projectileImageSelect: HTMLSelectElement;
      projectileImageScale: HTMLInputElement;
      projectileRotationSpeed: HTMLInputElement;
      weaponImagePath: HTMLInputElement;
      projectilePreviewAngle = 0;
      projectilePreviewTime = performance.now();
      controls: Record<ControlName, NumericInput>;
      labels: Record<ControlName, HTMLElement>;
      images: {
            body: HTMLImageElement;
            weaponIdle: HTMLImageElement;
            weaponAttack: HTMLImageElement;
            projectile: HTMLImageElement;
      };
      constructor() {
            this.canvas = requireElement<HTMLCanvasElement>("studio-canvas");
            const context = this.canvas.getContext("2d");
            if (!context)
                  throw new Error(
                        "Unable to create Character Studio canvas context",
                  );
            this.ctx = context;

            this.select = requireElement<HTMLSelectElement>("char-select");
            this.poseSelect = requireElement<HTMLSelectElement>("pose-select");
            this.poseImageSelect =
                  requireElement<HTMLSelectElement>("pose-image-select");
            this.poseImageInput =
                  requireElement<HTMLInputElement>("pose-image-path");
            this.defaultFacingSelect =
                  requireElement<HTMLSelectElement>("defaultFacing");
            this.resetPoseBtn =
                  requireElement<HTMLButtonElement>("reset-pose-btn");
            this.addPoseBtn = requireElement<HTMLButtonElement>("add-pose-btn");
            this.renamePoseBtn =
                  requireElement<HTMLButtonElement>("rename-pose-btn");
            this.removePoseBtn =
                  requireElement<HTMLButtonElement>("remove-pose-btn");
            this.poseDialog = requireElement<HTMLDialogElement>("pose-dialog");
            this.poseDialogForm =
                  requireElement<HTMLFormElement>("pose-dialog-form");
            this.poseDialogTitle = requireElement("pose-dialog-title");
            this.poseDialogKey =
                  requireElement<HTMLSelectElement>("pose-dialog-key");
            this.poseDialogImageSelect = requireElement<HTMLSelectElement>(
                  "pose-dialog-image-select",
            );
            this.poseDialogImage =
                  requireElement<HTMLInputElement>("pose-dialog-image");
            this.poseDialogError = requireElement("pose-dialog-error");
            this.imageOutput = requireElement<HTMLInputElement>("image-output");
            this.hitboxType = requireElement<HTMLSelectElement>("hitboxType");
            this.editHitboxBtn =
                  requireElement<HTMLButtonElement>("edit-hitbox-btn");
            this.applyHitboxBtn =
                  requireElement<HTMLButtonElement>("apply-hitbox-btn");
            this.cancelHitboxBtn =
                  requireElement<HTMLButtonElement>("cancel-hitbox-btn");
            this.cropBtn = requireElement<HTMLButtonElement>("crop-btn");
            this.applyCropBtn =
                  requireElement<HTMLButtonElement>("apply-crop-btn");
            this.cancelCropBtn =
                  requireElement<HTMLButtonElement>("cancel-crop-btn");
            this.saveBtn = requireElement<HTMLButtonElement>("save-config-btn");
            this.hitboxOutput =
                  requireElement<HTMLInputElement>("hitbox-output");
            this.attackHitboxAbilitySelect = requireElement<HTMLSelectElement>(
                  "attackHitboxAbility",
            );
            this.projectileImageSelect = requireElement<HTMLSelectElement>(
                  "projectile-image-select",
            );
            this.projectileImageScale = requireElement<HTMLInputElement>(
                  "projectileImageScale",
            );
            this.projectileRotationSpeed = requireElement<HTMLInputElement>(
                  "projectileRotationSpeed",
            );
            this.weaponImagePath =
                  requireElement<HTMLInputElement>("weaponImagePath");

            this.controls = {
                  hitboxWidth: requireElement<NumericInput>("hitboxWidth"),
                  hitboxHeight: requireElement<NumericInput>("hitboxHeight"),
                  hitboxRadius: requireElement<NumericInput>("hitboxRadius"),
                  hitboxOffsetX: requireElement<NumericInput>("hitboxOffsetX"),
                  hitboxOffsetY: requireElement<NumericInput>("hitboxOffsetY"),
                  attackHitboxWidth:
                        requireElement<NumericInput>("attackHitboxWidth"),
                  attackHitboxHeight:
                        requireElement<NumericInput>("attackHitboxHeight"),
                  attackHitboxOffsetX: requireElement<NumericInput>(
                        "attackHitboxOffsetX",
                  ),
                  attackHitboxOffsetY: requireElement<NumericInput>(
                        "attackHitboxOffsetY",
                  ),
                  imageScale: requireElement<NumericInput>("imageScale"),
                  imageOffsetX: requireElement<NumericInput>("imageOffsetX"),
                  imageOffsetY: requireElement<NumericInput>("imageOffsetY"),
                  healthBarOffsetX:
                        requireElement<NumericInput>("healthBarOffsetX"),
                  healthBarOffsetY:
                        requireElement<NumericInput>("healthBarOffsetY"),
                  weaponScale: requireElement<NumericInput>("weaponScale"),
                  weaponOffsetX: requireElement<NumericInput>("weaponOffsetX"),
                  weaponOffsetY: requireElement<NumericInput>("weaponOffsetY"),
                  weaponPivotX: requireElement<NumericInput>("weaponPivotX"),
                  weaponPivotY: requireElement<NumericInput>("weaponPivotY"),
                  swingStartDegrees:
                        requireElement<NumericInput>("swingStartDegrees"),
                  swingEndDegrees:
                        requireElement<NumericInput>("swingEndDegrees"),
                  imageCropX: requireElement<NumericInput>("imageCropX"),
                  imageCropY: requireElement<NumericInput>("imageCropY"),
                  imageCropWidth:
                        requireElement<NumericInput>("imageCropWidth"),
                  imageCropHeight:
                        requireElement<NumericInput>("imageCropHeight"),
            };

            this.labels = {
                  hitboxWidth: requireElement("val-hitboxWidth"),
                  hitboxHeight: requireElement("val-hitboxHeight"),
                  hitboxRadius: requireElement("val-hitboxRadius"),
                  hitboxOffsetX: requireElement("val-hitboxOffsetX"),
                  hitboxOffsetY: requireElement("val-hitboxOffsetY"),
                  attackHitboxWidth: requireElement("val-attackHitboxWidth"),
                  attackHitboxHeight: requireElement("val-attackHitboxHeight"),
                  attackHitboxOffsetX: requireElement(
                        "val-attackHitboxOffsetX",
                  ),
                  attackHitboxOffsetY: requireElement(
                        "val-attackHitboxOffsetY",
                  ),
                  imageScale: requireElement("val-imageScale"),
                  imageOffsetX: requireElement("val-imageOffsetX"),
                  imageOffsetY: requireElement("val-imageOffsetY"),
                  healthBarOffsetX: requireElement("val-healthBarOffsetX"),
                  healthBarOffsetY: requireElement("val-healthBarOffsetY"),
                  weaponScale: requireElement("val-weaponScale"),
                  weaponOffsetX: requireElement("val-weaponOffsetX"),
                  weaponOffsetY: requireElement("val-weaponOffsetY"),
                  weaponPivotX: requireElement("val-weaponPivotX"),
                  weaponPivotY: requireElement("val-weaponPivotY"),
                  swingStartDegrees: requireElement("val-swingStartDegrees"),
                  swingEndDegrees: requireElement("val-swingEndDegrees"),
                  imageCropX: requireElement("val-imageCropX"),
                  imageCropY: requireElement("val-imageCropY"),
                  imageCropWidth: requireElement("val-imageCropWidth"),
                  imageCropHeight: requireElement("val-imageCropHeight"),
            };

            this.images = {
                  body: new Image(),
                  weaponIdle: new Image(),
                  weaponAttack: new Image(),
                  projectile: new Image(),
            };
      }
}
