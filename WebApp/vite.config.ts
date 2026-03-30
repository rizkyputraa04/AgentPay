import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import inject from "@rollup/plugin-inject";

export default defineConfig({
  plugins: [
    react(),
    {
      ...inject({
        Buffer: ["buffer", "Buffer"],
      }),
      enforce: "post",
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      buffer: "buffer",
    },
  },
  define: {
    "process.env": {},
    global: "globalThis",
  },
  optimizeDeps: {
    include: ["buffer"],
  },
  server: {
    port: 8080,
  },
});