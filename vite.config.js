import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "marigold-api",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith("/api")) return next();
          import("./server/http.mjs")
            .then(({ handleNodeRequest }) => handleNodeRequest(req, res))
            .catch((error) => {
              console.error(error);
              if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader("content-type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ error: "Internal error." }));
              }
            });
        });
      },
    },
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/data/**", "**/*.sqlite", "**/*.sqlite-wal", "**/*.sqlite-shm"],
    },
  },
});
