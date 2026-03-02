FROM python:3.9-slim

# Sistem kütüphanelerini yükle (Pyroomacoustics için gerekli olabilir)
RUN apt-get update && apt-get install -y libsndfile1 build-essential && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# FastAPI'yi 8000 portundan dışarı aç
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
