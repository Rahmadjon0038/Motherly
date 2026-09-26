# 1-bosqich: paketlarni o'rnatish va saytni yig'ish
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Backend manzili yig'ish paytida saytga "yopishtirib" qo'yiladi (brauzer shu manzilga murojaat qiladi).
ARG NEXT_PUBLIC_API_URL=http://localhost:5100
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

# 2-bosqich: faqat ishlashga kerak narsalar (imij ancha yengil bo'ladi)
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
