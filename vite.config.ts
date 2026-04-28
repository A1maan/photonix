import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createPlannerMiddleware } from "./server/deepseekPlanner";

function plannerApiPlugin(apiKey?: string): Plugin {
  return {
    name: "photonix-planner-api",
    configureServer(server) {
      server.middlewares.use("/api/planner", createPlannerMiddleware(apiKey));
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/planner", createPlannerMiddleware(apiKey));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const deepSeekApiKey = env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;

  return {
    plugins: [react(), plannerApiPlugin(deepSeekApiKey)],
  };
});
