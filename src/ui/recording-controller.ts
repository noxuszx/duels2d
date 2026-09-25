import { Howler } from "howler";
import type { GameManager, RecordingView } from "../engine/game-manager";
import type { SoundPlayback } from "../entities/fighter-audio";

const OUTPUT_WIDTH = 1440;
const OUTPUT_HEIGHT = 2560;
const OUTPUT_ASPECT = OUTPUT_WIDTH / OUTPUT_HEIGHT;
// Increase this to show more of the arena; decrease it for a tighter crop.
// Camera height is derived from the 9:16 output aspect ratio.
const CAMERA_VIEW_WIDTH = 500;
// Larger smooth times and lower max speeds produce gentler camera movement.
// Lower smooth time (e.g. 0.25s) and higher max speed (e.g. 1200 px/s) make camera tracking snappy and aggressive.
const CAMERA_SMOOTH_TIME_SECONDS = 0.25;
const CAMERA_MAX_SPEED = 1200;
// 0 locks the camera vertically; 1 follows the fighters at full range.
const CAMERA_VERTICAL_FOLLOW = 0.25;
const FRAME_RATE = 60;
const VIDEO_BITS_PER_SECOND = 32_000_000;
const AUDIO_BITS_PER_SECOND = 192_000;
const VICTORY_FALLBACK_TAIL_MS = 1800;
const VICTORY_SOUND_TAIL_MS = 300;
const TITLE_OFFSET = 42;

interface CameraRect {
      centerX: number;
      centerY: number;
      width: number;
      height: number;
}

interface FormatChoice {
      mimeType?: string;
      extension: "mp4" | "webm";
}

export class RecordingController {
      private readonly button: HTMLButtonElement;
      private readonly frame: HTMLDivElement;
      private readonly outputCanvas: HTMLCanvasElement;
      private readonly outputContext: CanvasRenderingContext2D;
      private camera: CameraRect | null = null;
      private cameraVelocityX = 0;
      private cameraVelocityY = 0;
      private previousFrameTime = performance.now();
      private recorder: MediaRecorder | null = null;
      private audioDestination: MediaStreamAudioDestinationNode | null = null;
      private chunks: Blob[] = [];
      private stopTimer: number | null = null;
      private victoryCleanup: (() => void) | null = null;

      constructor(private readonly game: GameManager) {
            this.button = this.requireButton("transport-record");
            const container = document.getElementById("game-container");
            if (!(container instanceof HTMLElement))
                  throw new Error("Missing game container for recording preview.");

            this.frame = document.createElement("div");
            this.frame.className = "recording-camera-frame";
            this.frame.setAttribute("aria-hidden", "true");
            container.append(this.frame);

            this.outputCanvas = document.createElement("canvas");
            this.outputCanvas.width = OUTPUT_WIDTH;
            this.outputCanvas.height = OUTPUT_HEIGHT;
            const context = this.outputCanvas.getContext("2d", { alpha: false });
            if (!context)
                  throw new Error("Unable to create the recording canvas.");
            this.outputContext = context;

            this.button.addEventListener("click", () => void this.toggleRecording());
            window.addEventListener("duels2d:gameover", (event: Event) => {
                  if (!this.recorder || this.recorder.state === "inactive") return;
                  if (this.stopTimer !== null) {
                        window.clearTimeout(this.stopTimer);
                        this.stopTimer = null;
                  }
                  if (this.victoryCleanup) {
                        this.victoryCleanup();
                        this.victoryCleanup = null;
                  }

                  const customEvent = event as CustomEvent<{
                        victoryPlayback?: SoundPlayback | null;
                  }>;
                  const victory = customEvent.detail?.victoryPlayback;

                  if (victory) {
                        let stopped = false;
                        const onFinish = () => {
                              if (stopped) return;
                              stopped = true;
                              if (this.victoryCleanup) {
                                    this.victoryCleanup();
                                    this.victoryCleanup = null;
                              }
                              this.stopTimer = window.setTimeout(
                                    () => this.stopRecording(),
                                    VICTORY_SOUND_TAIL_MS,
                              );
                        };

                        victory.sound.once("end", onFinish, victory.playbackId);
                        victory.sound.once("stop", onFinish, victory.playbackId);
                        victory.sound.once("playerror", onFinish, victory.playbackId);

                        this.victoryCleanup = () => {
                              stopped = true;
                              victory.sound.off("end", onFinish, victory.playbackId);
                              victory.sound.off("stop", onFinish, victory.playbackId);
                              victory.sound.off("playerror", onFinish, victory.playbackId);
                        };

                        const durationSec = victory.sound.duration(victory.playbackId) || 5;
                        this.stopTimer = window.setTimeout(
                              onFinish,
                              Math.ceil(durationSec * 1000) + 1000,
                        );
                  } else {
                        this.stopTimer = window.setTimeout(
                              () => this.stopRecording(),
                              VICTORY_FALLBACK_TAIL_MS,
                        );
                  }
            });

            requestAnimationFrame((now) => this.render(now));
      }

      private render(now: number): void {
            const view = this.game.getRecordingView();
            const elapsedSeconds = Math.min(
                  0.1,
                  Math.max(0, (now - this.previousFrameTime) / 1000),
            );
            this.previousFrameTime = now;
            this.camera = this.updateCamera(view, elapsedSeconds);
            this.drawRecordingFrame(view, this.camera);
            this.positionPreview(this.camera, view.visualOverflow);
            requestAnimationFrame((nextNow) => this.render(nextNow));
      }

      private updateCamera(view: RecordingView, elapsedSeconds: number): CameraRect {
            const arenaCenterX = view.visualOverflow + view.arenaWidth / 2;
            const arenaCenterY = view.visualOverflow + view.arenaHeight / 2;
            const targetX = view.targets.length
                  ? view.targets.reduce((sum, target) => sum + target.x, 0) /
                  view.targets.length
                  : arenaCenterX;
            const actionCenterY = view.targets.length
                  ? view.targets.reduce((sum, target) => sum + target.y, 0) /
                  view.targets.length
                  : arenaCenterY;
            const targetY =
                  arenaCenterY +
                  (actionCenterY - arenaCenterY) * CAMERA_VERTICAL_FOLLOW;
            if (!this.camera)
                  return {
                        centerX: arenaCenterX,
                        centerY: arenaCenterY,
                        width: CAMERA_VIEW_WIDTH,
                        height: CAMERA_VIEW_WIDTH / OUTPUT_ASPECT,
                  };

            const horizontal = this.smoothDamp(
                  this.camera.centerX,
                  targetX,
                  this.cameraVelocityX,
                  elapsedSeconds,
            );
            const vertical = this.smoothDamp(
                  this.camera.centerY,
                  targetY,
                  this.cameraVelocityY,
                  elapsedSeconds,
            );
            this.cameraVelocityX = horizontal.velocity;
            this.cameraVelocityY = vertical.velocity;
            return {
                  centerX: horizontal.value,
                  centerY: vertical.value,
                  width: CAMERA_VIEW_WIDTH,
                  height: CAMERA_VIEW_WIDTH / OUTPUT_ASPECT,
            };
      }

      private drawRecordingFrame(view: RecordingView, camera: CameraRect): void {
            const context = this.outputContext;
            const outputScale = OUTPUT_WIDTH / camera.width;
            const cameraX = camera.centerX - camera.width / 2;
            const cameraY = camera.centerY - camera.height / 2;
            context.fillStyle = view.backgroundColor;
            context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
            context.fillStyle = view.arenaBackgroundColor;
            context.fillRect(
                  (view.visualOverflow - cameraX) * outputScale,
                  (view.visualOverflow - cameraY) * outputScale,
                  view.arenaWidth * outputScale,
                  view.arenaHeight * outputScale,
            );
            context.drawImage(
                  view.canvas,
                  -cameraX * outputScale,
                  -cameraY * outputScale,
                  view.logicalWidth * outputScale,
                  view.logicalHeight * outputScale,
            );
            this.drawMatchupTitle(view, cameraX, cameraY, outputScale);
      }

      private drawMatchupTitle(
            view: RecordingView,
            cameraX: number,
            cameraY: number,
            outputScale: number,
      ): void {
            const [firstName, secondName] = view.fighterNames;
            if (!firstName || !secondName) return;

            const context = this.outputContext;
            const firstText = `${firstName} `;
            const versusText = "VS";
            const secondText = ` ${secondName}`;
            const fontSize = 32 * outputScale;
            context.save();
            context.font = `700 ${fontSize}px sans-serif`;
            context.textAlign = "left";
            context.textBaseline = "middle";
            context.lineJoin = "round";
            const firstWidth = context.measureText(firstText).width;
            const versusWidth = context.measureText(versusText).width;
            const secondWidth = context.measureText(secondText).width;
            const totalWidth = firstWidth + versusWidth + secondWidth;
            const arenaCenterX = view.visualOverflow + view.arenaWidth / 2;
            let x = (arenaCenterX - cameraX) * outputScale - totalWidth / 2;
            const y =
                  (view.visualOverflow - TITLE_OFFSET - cameraY) * outputScale;

            context.strokeStyle = "rgba(0, 0, 0, 0.45)";
            context.lineWidth = 3 * outputScale;
            context.strokeText(firstText, x, y);
            context.fillStyle = "#ffffff";
            context.fillText(firstText, x, y);
            x += firstWidth;
            context.strokeText(versusText, x, y);
            context.fillStyle = "#ffff00";
            context.fillText(versusText, x, y);
            x += versusWidth;
            context.strokeText(secondText, x, y);
            context.fillStyle = "#ffffff";
            context.fillText(secondText, x, y);
            context.restore();
      }

      private positionPreview(camera: CameraRect, overflow: number): void {
            this.frame.style.left = `${camera.centerX - camera.width / 2 - overflow}px`;
            this.frame.style.top = `${camera.centerY - camera.height / 2 - overflow}px`;
            this.frame.style.width = `${camera.width}px`;
            this.frame.style.height = `${camera.height}px`;
      }

      private async toggleRecording(): Promise<void> {
            if (this.recorder && this.recorder.state !== "inactive") {
                  this.stopRecording();
                  return;
            }
            if (!("MediaRecorder" in window) || !this.outputCanvas.captureStream) {
                  this.setButtonState(false, "Recording is unsupported in this browser");
                  return;
            }

            if (Howler.ctx.state === "suspended") await Howler.ctx.resume();
            const videoStream = this.outputCanvas.captureStream(FRAME_RATE);
            this.audioDestination = Howler.ctx.createMediaStreamDestination();
            Howler.masterGain.connect(this.audioDestination);
            const stream = new MediaStream([
                  ...videoStream.getVideoTracks(),
                  ...this.audioDestination.stream.getAudioTracks(),
            ]);
            const format = this.chooseFormat();
            const options: MediaRecorderOptions = {
                  videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
                  audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
            };
            if (format.mimeType) options.mimeType = format.mimeType;

            this.chunks = [];
            this.recorder = new MediaRecorder(stream, options);
            this.recorder.addEventListener("dataavailable", (event) => {
                  if (event.data.size > 0) this.chunks.push(event.data);
            });
            this.recorder.addEventListener("stop", () => {
                  const actualType = this.recorder?.mimeType || format.mimeType || "video/webm";
                  const blob = new Blob(this.chunks, { type: actualType });
                  this.download(blob, format.extension);
                  stream.getTracks().forEach((track) => track.stop());
                  this.disconnectAudioDestination();
                  this.recorder = null;
                  this.setButtonState(false, "Record a new match");
            });
            this.recorder.addEventListener("error", () => {
                  stream.getTracks().forEach((track) => track.stop());
                  this.disconnectAudioDestination();
                  this.recorder = null;
                  this.setButtonState(false, "Recording failed");
            });

            const activeRecorder = this.recorder;
            activeRecorder.addEventListener(
                  "start",
                  () => {
                        requestAnimationFrame(() => {
                              if (
                                    this.recorder === activeRecorder &&
                                    activeRecorder.state === "recording"
                              )
                                    this.game.restart();
                        });
                  },
                  { once: true },
            );
            this.game.pause();
            Howler.stop();
            this.recorder.start(1000);
            this.setButtonState(true, "Stop and save recording");
      }

      private stopRecording(): void {
            if (this.stopTimer !== null) {
                  window.clearTimeout(this.stopTimer);
                  this.stopTimer = null;
            }
            if (this.victoryCleanup) {
                  this.victoryCleanup();
                  this.victoryCleanup = null;
            }
            if (this.recorder && this.recorder.state !== "inactive")
                  this.recorder.stop();
      }

      private chooseFormat(): FormatChoice {
            const candidates: Array<Required<FormatChoice>> = [
                  {
                        mimeType: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
                        extension: "mp4",
                  },
                  { mimeType: "video/mp4", extension: "mp4" },
                  {
                        mimeType: "video/webm;codecs=vp9,opus",
                        extension: "webm",
                  },
                  {
                        mimeType: "video/webm;codecs=vp8,opus",
                        extension: "webm",
                  },
                  { mimeType: "video/webm", extension: "webm" },
            ];
            return (
                  candidates.find(({ mimeType }) =>
                        MediaRecorder.isTypeSupported(mimeType),
                  ) ?? { extension: "webm" }
            );
      }

      private download(blob: Blob, extension: "mp4" | "webm"): void {
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            link.href = url;
            link.download = `duels2d-${timestamp}.${extension}`;
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      private disconnectAudioDestination(): void {
            if (!this.audioDestination) return;
            Howler.masterGain.disconnect(this.audioDestination);
            this.audioDestination = null;
      }

      private setButtonState(recording: boolean, title: string): void {
            this.button.classList.toggle("recording", recording);
            this.frame.classList.toggle("recording", recording);
            this.button.setAttribute("aria-pressed", String(recording));
            this.button.title = title;
            this.button.setAttribute("aria-label", title);
      }

      private requireButton(id: string): HTMLButtonElement {
            const button = document.getElementById(id);
            if (!(button instanceof HTMLButtonElement))
                  throw new Error(`Missing recording control: ${id}`);
            return button;
      }

      private smoothDamp(
            current: number,
            target: number,
            velocity: number,
            elapsedSeconds: number,
      ): { value: number; velocity: number } {
            const smoothTime = Math.max(0.001, CAMERA_SMOOTH_TIME_SECONDS);
            const omega = 2 / smoothTime;
            const scaledTime = omega * elapsedSeconds;
            const decay =
                  1 /
                  (1 +
                        scaledTime +
                        0.48 * scaledTime * scaledTime +
                        0.235 * scaledTime * scaledTime * scaledTime);
            const originalTarget = target;
            let difference = current - target;
            const maximumDifference = CAMERA_MAX_SPEED * smoothTime;
            difference = Math.max(
                  -maximumDifference,
                  Math.min(maximumDifference, difference),
            );
            target = current - difference;
            const temporary = (velocity + omega * difference) * elapsedSeconds;
            let nextVelocity = (velocity - omega * temporary) * decay;
            let value = target + (difference + temporary) * decay;

            const passedTarget =
                  (originalTarget - current > 0) === (value > originalTarget);
            if (passedTarget) {
                  value = originalTarget;
                  nextVelocity = 0;
            }
            return { value, velocity: nextVelocity };
      }

}
