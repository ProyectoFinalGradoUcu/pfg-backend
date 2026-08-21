import { defineConfig } from "prisma/config";
import "dotenv/config";

// En contenedor Docker, DATABASE_URL viene de env vars del contenedor.
// En local, se carga desde .env gracias al import de arriba.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
