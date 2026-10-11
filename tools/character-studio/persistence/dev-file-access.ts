import type { StudioFileHandle } from "../app/editor-types";

const ENDPOINT = "/__studio/fighters";

/** Adapt the dev server to the same ordered write queue used by native files. */
export async function connectDevFiles(): Promise<Map<string, StudioFileHandle>> {
      const handles = new Map<string, StudioFileHandle>();
      if (!import.meta.env.DEV) return handles;
      const response = await fetch(ENDPOINT);
      if (!response.ok) throw new Error("Studio could not connect to project files");
      const { token, files } = await response.json() as { token: string; files: string[] };
      for (const file of files) {
            const id = file.slice(0, -".json".length);
            handles.set(id, {
                  async createWritable() {
                        let content = "";
                        return {
                              async write(value: string) { content = value; },
                              async close() {
                                    const saved = await fetch(ENDPOINT, {
                                          method: "POST",
                                          headers: {
                                                "Content-Type": "application/json",
                                                "X-Studio-Token": token,
                                          },
                                          body: JSON.stringify({ id, content }),
                                    });
                                    if (!saved.ok) {
                                          const result = await saved.json();
                                          throw new Error(result.error ?? "Project file save failed");
                                    }
                              },
                        };
                  },
            });
      }
      return handles;
}
