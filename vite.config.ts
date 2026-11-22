import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const apiPort = Number(process.env.BUKTILAUT_API_PORT || 8787);
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535)
  throw new Error("BUKTILAUT_API_PORT harus berupa port lokal yang valid.");
const proxy = { "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } };
export default defineConfig({
  plugins: [react()],
  server: { strictPort: true, proxy },
  preview: { strictPort: true, proxy },
});
