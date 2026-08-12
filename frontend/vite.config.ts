import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    env: { VITE_GENLAYER_CONTRACT_ADDRESS: "" },
    setupFiles: "./src/test/setup.ts",
  },
});
