FROM node:20-alpine AS build
WORKDIR /app

# Instala dependencias (incluye dev necesarias para la compilación)
COPY package.json ./
RUN npm install

# Copia archivos de configuración, prisma y código fuente
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY tsconfig*.json ./
COPY src ./src

# Genera cliente Prisma y compila la aplicación
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copia dependencias, app compilada y archivos necesarios para runtime
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/bin/sh", "./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]

