import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the `@/*` → `src/*` alias from tsconfig so tests can import the
    // same module specifiers the app does.
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    // Only the frontend sources; `backend/` has its own vitest project.
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
