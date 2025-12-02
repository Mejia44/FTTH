# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# dependencias del sistema necesarias para paquetes geoespaciales (GDAL, headers)
RUN apt-get update && apt-get install -y build-essential gdal-bin libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

# instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# copiar la aplicación
COPY app ./app

ENV PYTHONUNBUFFERED=1

# Arranque sin --reload (más estable dentro de contenedores)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
