import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // starkzap's confidential module imports this optional peer dep.
      // We don't use confidential features, so stub it out for both dev and build.
      "@fatsolutions/tongo-sdk": path.resolve(
        __dirname,
        "src/stubs/tongo-sdk.ts"
      ),
    },
  },
});
