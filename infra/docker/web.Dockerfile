FROM node:22-alpine
WORKDIR /app
COPY apps/web/package.json /app/apps/web/package.json
COPY apps/web/tsconfig.json /app/apps/web/tsconfig.json
COPY apps/web/next.config.ts /app/apps/web/next.config.ts
COPY apps/web/tailwind.config.ts /app/apps/web/tailwind.config.ts
COPY apps/web/postcss.config.mjs /app/apps/web/postcss.config.mjs
RUN cd /app/apps/web && npm install
COPY apps/web /app/apps/web
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npm", "run", "dev"]

