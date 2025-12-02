# backend/app/main.py
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path
import os

# Importar todos los routers
from app.api import analyze, data, config_db, ai_recommendations

app = FastAPI(title="FTTH Analyzer")

# Incluir todos los routers
app.include_router(analyze.router, prefix="/api/analyze", tags=["analyze"])
app.include_router(data.router, prefix="/api/data", tags=["data"])
app.include_router(config_db.router, prefix="/api/config", tags=["config"])
app.include_router(ai_recommendations.router, prefix="/api/ai", tags=["ai"])

# Detectar carpeta frontend (local o dentro de contenedor)
local_frontend = Path(__file__).resolve().parents[2] / "frontend"
if local_frontend.exists():
    frontend_dir = str(local_frontend)
else:
    frontend_dir = os.environ.get("FRONTEND_DIR", "/frontend")

# Montamos los archivos estáticos en /frontend
app.mount("/frontend", StaticFiles(directory=frontend_dir), name="frontend")

# Servir index.html en la raíz
@app.get("/", include_in_schema=False)
def serve_index():
    index_path = Path(frontend_dir) / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return JSONResponse({"error": "index.html not found"}, status_code=404)

# Health check
@app.get("/health")
def health():
    return {"ok": True, "status": "alive"}