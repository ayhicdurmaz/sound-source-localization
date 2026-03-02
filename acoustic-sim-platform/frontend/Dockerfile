FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .

# Vite'ın dış dünyadan erişilebilir olması için --host ekliyoruz
CMD ["npm", "run", "dev", "--", "--host"]
