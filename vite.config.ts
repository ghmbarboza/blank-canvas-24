// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const buildSha = (() => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    // sem o binário do git no build (acontece no Lovable): lê o .git direto
    try {
      const head = readFileSync(".git/HEAD", "utf8").trim();
      if (!head.startsWith("ref: ")) return head;
      const ref = head.slice(5);
      if (existsSync(`.git/${ref}`)) return readFileSync(`.git/${ref}`, "utf8").trim();
      const packed = readFileSync(".git/packed-refs", "utf8")
        .split("\n")
        .find((l) => l.endsWith(` ${ref}`));
      if (packed) return packed.split(" ")[0]!;
    } catch {
      // segue para a variável do CI
    }
    return process.env["GITHUB_SHA"] ?? "unknown";
  }
})();

export default defineConfig({
  vite: {
    define: { __NEXUS_BUILD_SHA__: JSON.stringify(buildSha) },
    resolve: {
      alias: [
        // @openai/agents → SDK de MCP → pkce-challenge, que não exporta para "workerd". A versão
        // de navegador usa só WebCrypto, que o Cloudflare Workers tem.
        {
          find: /^pkce-challenge$/,
          replacement: fileURLToPath(
            new URL("./node_modules/pkce-challenge/dist/index.browser.js", import.meta.url),
          ),
        },
      ],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
