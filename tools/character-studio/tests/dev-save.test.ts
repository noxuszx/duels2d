import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { PassThrough } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { MinimalPluginContextWithoutEnvironment, ViteDevServer } from "vite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { studioDevSave } from "../persistence/dev-save-plugin";

vi.mock("node:fs/promises", async (importOriginal) => {
      const original = await importOriginal<typeof import("node:fs/promises")>();
      return { ...original, rename: vi.fn(original.rename) };
});

describe("Studio development saving", () => {
      let root: string;
      let original: string;
      let token: string;
      let middleware: (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

      async function request(method: string, body?: unknown, headers: Record<string, string> = {}) {
            const stream = Object.assign(new PassThrough(), {
                  url: "/__studio/fighters",
                  method,
                  headers: { host: "localhost:5173", origin: "http://localhost:5173", ...headers },
            });
            const result = new Promise<{ status: number; data: { token: string; files: string[]; error?: string } }>((done) => {
                  const response = {
                        statusCode: 200,
                        setHeader: vi.fn(),
                        end(value: string) { done({ status: this.statusCode, data: JSON.parse(value) }); },
                  };
                  middleware(stream as unknown as IncomingMessage, response as unknown as ServerResponse, vi.fn());
            });
            stream.end(body === undefined ? undefined : JSON.stringify(body));
            return result;
      }

      beforeEach(async () => {
            vi.mocked(rename).mockClear();
            root = await mkdtemp(resolve(tmpdir(), "studio-save-"));
            const directory = resolve(root, "config/fighters");
            await mkdir(directory, { recursive: true });
            original = await readFile(resolve("config/fighters/alien.json"), "utf8");
            await writeFile(resolve(directory, "index.json"), JSON.stringify({ fighters: ["alien.json"] }));
            await writeFile(resolve(directory, "alien.json"), original);
            const plugin = studioDevSave();
            if (typeof plugin.configureServer !== "function") throw new Error("Missing server hook");
            await plugin.configureServer.call({} as MinimalPluginContextWithoutEnvironment, {
                  config: { root, logger: { error: vi.fn() } },
                  middlewares: { use(callback: typeof middleware) { middleware = callback; } },
            } as unknown as ViteDevServer);
            const connection = await request("GET");
            expect(connection.status).toBe(200);
            expect(connection.data.files).toEqual(["alien.json"]);
            token = connection.data.token;
      });

      afterEach(async () => { await rm(root, { recursive: true, force: true }); });

      const headers = () => ({ "x-studio-token": token, "content-type": "application/json" });

      it("replaces the original roster file and removes the temporary file", async () => {
            const content = `${JSON.stringify(JSON.parse(original), null, 2)}\n`;
            const saved = await request("POST", { id: "alien", content }, headers());
            expect(saved.status).toBe(200);
            expect(await readFile(resolve(root, "config/fighters/alien.json"), "utf8")).toBe(content);
            expect((await readdir(resolve(root, "config/fighters"))).sort()).toEqual(["alien.json", "index.json"]);
      });

      it("rejects invalid JSON and preserves the original file", async () => {
            const saved = await request("POST", { id: "alien", content: '{"id":"alien"}' }, headers());
            expect(saved.status).toBe(400);
            expect(await readFile(resolve(root, "config/fighters/alien.json"), "utf8")).toBe(original);
      });

      it("retries a temporary Windows lock and completes the save", async () => {
            vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error("locked"), { code: "EPERM" }));
            const content = `${JSON.stringify(JSON.parse(original), null, 2)}\n`;
            expect((await request("POST", { id: "alien", content }, headers())).status).toBe(200);
            expect(rename).toHaveBeenCalledTimes(2);
            expect(await readFile(resolve(root, "config/fighters/alien.json"), "utf8")).toBe(content);
      });

      it("preserves the original and cleans up if the file stays locked", async () => {
            for (let attempt = 0; attempt < 8; attempt++)
                  vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error("locked"), { code: "EPERM" }));
            expect((await request("POST", { id: "alien", content: original }, headers())).status).toBe(400);
            expect(rename).toHaveBeenCalledTimes(8);
            expect(await readFile(resolve(root, "config/fighters/alien.json"), "utf8")).toBe(original);
            expect((await readdir(resolve(root, "config/fighters"))).sort()).toEqual(["alien.json", "index.json"]);
            expect((await request("POST", { id: "alien", content: original }, headers())).status).toBe(200);
      });

      it("rejects paths, unknown fighters, and mismatched IDs", async () => {
            expect((await request("POST", { id: "../alien", content: original }, headers())).status).toBe(400);
            expect((await request("POST", { id: "unknown", content: original }, headers())).status).toBe(404);
            const definition = JSON.parse(original);
            definition.id = "other";
            expect((await request("POST", { id: "alien", content: JSON.stringify(definition) }, headers())).status).toBe(400);
      });

      it("rejects unauthorized and cross origin writes", async () => {
            const body = { id: "alien", content: original };
            expect((await request("POST", body)).status).toBe(403);
            expect((await request("POST", body, { ...headers(), origin: "https://example.com" })).status).toBe(403);
            expect(await readFile(resolve(root, "config/fighters/alien.json"), "utf8")).toBe(original);
      });
});
