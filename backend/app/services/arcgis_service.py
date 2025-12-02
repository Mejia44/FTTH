# backend/app/services/arcgis_service.py
from arcgis.gis import GIS
import httpx
import asyncio
from typing import List, Dict, Tuple
import numpy as np
import logging
import json
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

class ArcGISService:
    def __init__(self):
        # Configurar URL de la nueva API (PaaS)
        self.elevation_url = "https://elevation-api.arcgis.com/arcgis/rest/services/elevation-service/v1/elevation/at-many-points"
        
        # Inicializar GIS solo para validar la key (opcional)
        if settings.ARCGIS_API_KEY:
            try:
                self.gis = GIS(api_key=settings.ARCGIS_API_KEY)
                logger.info("✅ ArcGIS GIS inicializado")
            except Exception as e:
                logger.warning(f"⚠️ Error iniciando GIS: {e}")
        else:
            self.gis = None

    async def get_elevation_profile(self, coordinates: List[Tuple[float, float]]) -> Dict:
        if not coordinates:
            return {"success": False, "elevations": []}

        # Procesar en lotes de 150 puntos para no saturar la API
        batch_size = 150
        all_elevations = []
        
        for i in range(0, len(coordinates), batch_size):
            batch = coordinates[i:i+batch_size]
            
            # ArcGIS pide orden: [Longitud, Latitud] -> [x, y]
            # Tus coordenadas vienen como [Lat, Lon] -> [y, x]
            points_json = {
                "points": [{"x": lon, "y": lat, "spatialReference": {"wkid": 4326}} for lat, lon in batch]
            }

            params = {
                "f": "json",
                "token": settings.ARCGIS_API_KEY, # TU API KEY DE SIEMPRE
                "geometry": json.dumps(points_json),
                "geometryType": "esriGeometryMultipoint"
            }

            try:
                # Llamada directa a la NUEVA API
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(self.elevation_url, data=params)
                    
                    if response.status_code == 200:
                        data = response.json()
                        # La nueva API devuelve 'result' -> 'points' -> 'z'
                        if "result" in data and "points" in data["result"]:
                            z_values = [p.get("z", 0) for p in data["result"]["points"]]
                            all_elevations.extend(z_values)
                        else:
                            # Intento alternativo de estructura
                            all_elevations.extend([0] * len(batch))
                    else:
                        logger.error(f"Error HTTP ArcGIS: {response.status_code}")
                        all_elevations.extend([0] * len(batch))

            except Exception as e:
                logger.error(f"Error conexión: {e}")
                all_elevations.extend([0] * len(batch))

        # Calcular estadísticas
        stats = self._calculate_stats(all_elevations, coordinates)
        return {
            "success": True, 
            "elevations": all_elevations,
            "statistics": stats
        }

    def _calculate_stats(self, elevations, coords):
        # Cálculo básico para evitar errores si la lista está vacía
        if not elevations: return {}
        return {
            "elevacion_promedio": round(np.mean(elevations), 2),
            "elevacion_max": round(max(elevations), 2),
            "desnivel_total": round(max(elevations) - min(elevations), 2)
        }

    # ESTA ES LA FUNCIÓN QUE TE FALTABA
    def test_connection(self):
        return {
            "connected": True, 
            "api_url": self.elevation_url,
            "has_key": bool(settings.ARCGIS_API_KEY)
        }

arcgis_service = ArcGISService()