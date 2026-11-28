import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("../../../../src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: [".team/tasks/TASK-002/review/repro-checks.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
