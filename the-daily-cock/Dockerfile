# Zero-dep app — no package install step needed, just Node + the source tree.
FROM node:20-alpine
WORKDIR /app
COPY . .
ENV DEV_TOOLS=0
ENV PORT=8788
EXPOSE 8788
CMD ["node", "server/dev-server.mjs"]
