import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { normalizePath, type Plugin } from "vite";
import { assertFighterDefinition } from "../../../src/config/validation.ts";

const ENDPOINT = "/__studio/fighters";
const MAX_BYTES = 1024 * 1024;

/** Windows readers can briefly deny replacement; retain atomic saving while retrying. */
async function replaceFile(source: string, destination: string): Promise<void> {
      for (let attempt = 0; ; attempt++) {
            try {
                  await rename(source, destination);
                  return;
            } catch (error) {
                  const code = (error as NodeJS.ErrnoException).code;
                  if (!["EPERM", "EACCES", "EBUSY"].includes(code ?? "") || attempt >= 7)
                        throw error;
                  await delay(Math.min(25 * 2 ** attempt, 200));
            }
      }
}

/** Local authoring only: expose existing roster files, never arbitrary paths. */
export function studioDevSave(): Plugin {
      const token = randomUUID();
      const savedContent = new Map<string, string>();
      return {
            name: "duels2d-studio-save",
            apply: "serve",
            configureServer(server) {
                  const root = resolve(server.config.root, "config/fighters");
                  server.middlewares.use((request, response, next) => {
                        const path = request.url?.split("?")[0];
                        if (path !== ENDPOINT) return next();
                        response.setHeader("Content-Type", "application/json");
                        response.setHeader("Cache-Control", "no-store");
                        const reply = (status: number, data: unknown) => {
                              response.statusCode = status;
                              response.end(JSON.stringify(data));
                        };
                        void (async () => {
                              if (request.method === "GET") {
                                    const manifest = JSON.parse(await readFile(resolve(root, "index.json"), "utf8"));
                                    reply(200, { token, files: manifest.fighters });
                                    return;
                              }
                              if (request.method !== "POST") {
                                    reply(405, { error: "Use GET or POST" });
                                    return;
                              }
                              const origin = request.headers.origin;
                              if (!origin || new URL(origin).host !== request.headers.host ||
                                  request.headers["x-studio-token"] !== token) {
                                    reply(403, { error: "Studio save requires a connection from this server" });
                                    return;
                              }
                              if (request.headers["content-type"] !== "application/json") {
                                    reply(415, { error: "Expected application/json" });
                                    return;
                              }
                              const chunks: Buffer[] = [];
                              let size = 0;
                              for await (const chunk of request) {
                                    const buffer = Buffer.from(chunk);
                                    size += buffer.length;
                                    if (size > MAX_BYTES) {
                                          reply(413, { error: "Fighter file is too large" });
                                          return;
                                    }
                                    chunks.push(buffer);
                              }
                              const { id, content } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                              if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id) || typeof content !== "string") {
                                    reply(400, { error: "Invalid fighter save request" });
                                    return;
                              }
                              const filename = `${id}.json`;
                              const manifest = JSON.parse(await readFile(resolve(root, "index.json"), "utf8"));
                              if (!manifest.fighters.includes(filename)) {
                                    reply(404, { error: "Fighter is not in the roster" });
                                    return;
                              }
                              const definition = JSON.parse(content);
                              assertFighterDefinition(definition);
                              if (definition.id !== id) {
                                    reply(400, { error: "Fighter ID does not match its file" });
                                    return;
                              }
                              const destination = resolve(root, filename);
                              // Confirm the file still exists; this endpoint only edits existing fighters.
                              await readFile(destination, "utf8");
                              const temporary = `${destination}.${randomUUID()}.tmp`;
                              try {
                                    await writeFile(temporary, content, { flag: "wx" });
                                    savedContent.set(normalizePath(destination), content);
                                    await replaceFile(temporary, destination);
                              } finally {
                                    await rm(temporary, { force: true });
                              }
                              reply(200, { saved: filename });
                        })().catch((error: unknown) => {
                              server.config.logger.error(`Studio save failed: ${String(error)}`);
                              reply(400, { error: error instanceof Error ? error.message : "Save failed" });
                        });
                  });
            },
            async hotUpdate({ file }) {
                  // A completed Studio save must not reload the editor and discard its session.
                  const expected = savedContent.get(file);
                  if (expected !== undefined && await readFile(file, "utf8").catch(() => null) === expected)
                        return [];
            },
      };
}
