FROM node:24-alpine
WORKDIR /app

# Avval faqat paketlar: kod o'zgarganda ular qaytadan o'rnatilmaydi (Docker keshi ishlaydi).
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Yuklangan fayllar va maxfiy kalitlar konteynerdan tashqarida (volume) saqlanadi.
RUN mkdir -p uploads private

EXPOSE 5100
CMD ["node", "index.js"]
