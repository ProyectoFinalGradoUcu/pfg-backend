import { defineConfig } from "prisma/config";

// En contenedor Docker, DATABASE_URL viene de las env vars del contenedor, no de .env
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
