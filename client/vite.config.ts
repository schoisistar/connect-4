import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/connect-4/",
  server: {
    port: 5173
  }
});
