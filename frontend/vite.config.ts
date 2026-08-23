import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // loadEnv() reads .env files on disk — but inside Docker, vars are injected
  // directly into process.env, not written to a file. Check both sources.
  const ngrokDomain = env.NGROK_DOMAIN || process.env.NGROK_DOMAIN || "";
  const isDocker = !!ngrokDomain;

  const allowedHosts: string[] = ["localhost", "127.0.0.1"];
  if (ngrokDomain) allowedHosts.push(ngrokDomain);

  return {
    resolve: { tsconfigPaths: true },
    plugins: [tanstackStart(), tailwindcss(), react()],
    server: {
      allowedHosts,
      hmr: { overlay: false },
      proxy: {
        "/api": {
          // Docker: frontend → backend service name
          // Local:  frontend → localhost Django runserver
          target: isDocker ? "http://backend:8000" : "http://127.0.0.1:8000",
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});