/** Human-readable labels only; authored pose keys remain unchanged. */
export function poseLabel(key: string): string {
      const labels: Record<string, string> = {
            base: "Idle",
            idle: "Idle",
            attackWindup: "Attack Windup",
            attackActive: "Attack Active",
            recovery: "Recovery",
            crawl1: "Crawl 1",
            crawl2: "Crawl 2",
      };
      return (
            labels[key] ??
            key
                  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
                  .replace(/[-_]+/g, " ")
                  .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
      );
}
