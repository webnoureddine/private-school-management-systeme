import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, /api is proxied to Django (python manage.py runserver).
export default defineConfig({
  plugins: [react()],
  base: "/",
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8000" } },
});
