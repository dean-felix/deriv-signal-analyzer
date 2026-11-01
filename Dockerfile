FROM oven/bun:1
WORKDIR /app
COPY server.ts ./server.ts
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "server.ts"]
