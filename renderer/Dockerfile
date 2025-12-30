FROM node:20-alpine

WORKDIR /app

# Copy package files for both renderer and parent (for shared dependencies)
COPY renderer/package*.json ./renderer/
COPY package.json ./

# Install renderer dependencies
WORKDIR /app/renderer
RUN npm ci --only=production

# Copy shared source code from parent
WORKDIR /app
COPY src ./src

# Copy renderer source and config
COPY renderer/tsconfig.json ./renderer/
COPY renderer/src ./renderer/src

# Build the renderer
WORKDIR /app/renderer
RUN npm run build

CMD ["node", "dist/renderer/src/index.js"]
