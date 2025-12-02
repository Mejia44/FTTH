# backend/app/api/ai_recommendations.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import cohere
import logging
from typing import Dict, Any
from dotenv import load_dotenv

# Cargar .env ANTES de usarlo
load_dotenv()

router = APIRouter()
logger = logging.getLogger(__name__)

# Inicializar cliente Cohere
cohere_client = cohere.Client(os.getenv("COHERE_API_KEY", ""))

class AIAnalysisRequest(BaseModel):
    data_id: int


def _get_conn():
    return psycopg2.connect(
        host=os.environ.get("POSTGRES_HOST"),
        port=int(os.environ.get("POSTGRES_PORT", 5432)),
        dbname=os.environ.get("POSTGRES_DB"),
        user=os.environ.get("POSTGRES_USER"),
        password=os.environ.get("POSTGRES_PASSWORD"),
        sslmode='require'
    )
def get_environment_data(data_id: int) -> Dict[str, Any]:
    """Obtener datos del entorno y configuración desde la base de datos"""
    try:
        conn = _get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute(
            "SELECT geojson, step_m, metadata, created_at FROM collected_data WHERE id = %s",
            (data_id,)
        )
        
        result = cur.fetchone()
        if not result:
            raise ValueError("Datos no encontrados")
            
        cur.close()
        conn.close()
        
        return dict(result)
        
    except Exception as e:
        logger.error(f"Error obteniendo datos: {e}")
        raise

def analyze_route_basic(geojson_data: Dict) -> Dict[str, Any]:
    """Análisis básico de la ruta sin APIs externas"""
    from shapely.geometry import shape
    
    try:
        geom = shape(geojson_data)
        coordinates = list(geom.coords)
        
        # Análisis simple de la ruta
        total_points = len(coordinates)
        
        # Estimación de longitud en km (conversión aproximada)
        length_km = round(geom.length * 111, 2)
        
        # Análisis de coordenadas para determinar zona urbana aproximada
        center_lat = sum(coord[1] for coord in coordinates) / total_points
        center_lon = sum(coord[0] for coord in coordinates) / total_points
        
        # Centro aproximado de Guayaquil
        guayaquil_center = (-2.1709, -79.9224)
        
        # Distancia al centro para clasificar zona
        dist_to_center = ((center_lat - guayaquil_center[0])**2 + 
                         (center_lon - guayaquil_center[1])**2)**0.5
        
        if dist_to_center < 0.05:
            zone_type = "centro_urbano"
        elif dist_to_center < 0.1:
            zone_type = "urbano"
        elif dist_to_center < 0.2:
            zone_type = "suburbano"
        else:
            zone_type = "rural"
        
        # Análisis de dispersión para estimar complejidad del terreno
        lat_range = max(coord[1] for coord in coordinates) - min(coord[1] for coord in coordinates)
        lon_range = max(coord[0] for coord in coordinates) - min(coord[0] for coord in coordinates)
        
        if lat_range < 0.01 and lon_range < 0.01:
            terrain_complexity = "bajo"
        elif lat_range < 0.05 and lon_range < 0.05:
            terrain_complexity = "medio"
        else:
            terrain_complexity = "alto"
        
        return {
            "length_km": length_km,
            "total_points": total_points,
            "zone_type": zone_type,
            "terrain_complexity": terrain_complexity,
            "center_coordinates": (round(center_lat, 4), round(center_lon, 4))
        }
        
    except Exception as e:
        logger.error(f"Error en análisis básico: {e}")
        return {"error": str(e)}

def build_ai_prompt(route_data: Dict, metadata: Dict, analysis: Dict) -> str:
    """Construir prompt detallado para la IA"""
    
    # Extraer configuración del usuario
    config = metadata
    architecture = config.get('arquitectura', 'No especificada')
    architecture_label = config.get('arquitectura_label', architecture)
    split_ratio = config.get('split', 'No especificado')
    construction_type = config.get('enfoque', 'No especificado')
    construction_label = config.get('enfoque_label', construction_type)
    subconfig = config.get('subconfig_label', config.get('subconfig', 'No especificado'))
    num_clients = config.get('estudio_factibilidad', 'No especificado')
    
    prompt = f"""
Eres un ingeniero experto en telecomunicaciones especializado en despliegue de redes FTTH (Fiber to the Home). 
Analiza los siguientes datos y genera recomendaciones técnicas específicas y detalladas.

DATOS DEL PROYECTO:
- Arquitectura de red: {architecture_label} ({architecture})
- Tecnología/Topología: {subconfig}
- Relación de Split: {split_ratio}
- Tipo de construcción: {construction_label} ({construction_type})
- Número estimado de clientes: {num_clients}

ANÁLISIS DE LA RUTA:
- Longitud total: {analysis.get('length_km', 'N/A')} km
- Zona geográfica: {analysis.get('zone_type', 'N/A')}
- Complejidad del terreno: {analysis.get('terrain_complexity', 'N/A')}
- Ubicación central: {analysis.get('center_coordinates', 'N/A')}
- Puntos de muestreo: {analysis.get('total_points', 'N/A')}

CONTEXTO:
La ruta se encuentra en Guayaquil, Ecuador. Considera las características climáticas tropicales, 
normativas locales de telecomunicaciones, y condiciones urbanas típicas de la ciudad.

INSTRUCCIONES:
Genera un análisis profesional que incluya:

1. RESUMEN EJECUTIVO (2-3 líneas):
   - Estado general del proyecto
   - Viabilidad técnica
   - Advertencias críticas si las hay

2. RECOMENDACIONES TÉCNICAS:
   - Especificaciones de equipos recomendados
   - Consideraciones de instalación específicas
   - Optimizaciones basadas en la configuración elegida

3. FACTORES DE COSTO:
   - Elementos que podrían incrementar el presupuesto
   - Oportunidades de ahorro
   - Estimación de complejidad (Baja/Media/Alta)

4. EVALUACIÓN DE RIESGOS:
   - Riesgos técnicos identificados
   - Mitigaciones recomendadas
   - Consideraciones regulatorias

5. ESTRATEGIA DE DESPLIEGUE:
   - Fases de implementación sugeridas
   - Cronograma aproximado
   - Recursos necesarios

Sé específico, técnico pero comprensible, y enfócate en recomendaciones accionables.
Utiliza terminología profesional de telecomunicaciones y considera las mejores prácticas para FTTH.
"""
    
    return prompt

@router.post("/generate")
async def generate_ai_recommendations(request: AIAnalysisRequest):
    """Generar recomendaciones usando IA de Cohere"""
    
    try:
        # Verificar que tenemos la API key
        if not os.getenv("COHERE_API_KEY"):
            raise HTTPException(
                status_code=500, 
                detail="API key de Cohere no configurada. Añade COHERE_API_KEY al entorno."
            )
        
        # Obtener datos de la base de datos
        route_data = get_environment_data(request.data_id)
        
        # Análisis básico de la ruta
        analysis = analyze_route_basic(route_data['geojson'])
        
        if 'error' in analysis:
            raise HTTPException(status_code=500, detail=f"Error en análisis: {analysis['error']}")
        
        # Construir prompt para la IA
        prompt = build_ai_prompt(route_data, route_data['metadata'], analysis)
        
        logger.info(f"Enviando prompt a Cohere para data_id: {request.data_id}")
        
        # Llamar a la API de Chat de Cohere (NUEVA API)
        response = cohere_client.chat(
            model='command-r-08-2024',
            message=prompt,
            max_tokens=1500,
            temperature=0.3,
            preamble="Eres un ingeniero experto en telecomunicaciones especializado en redes FTTH."
        )
        
        ai_recommendations = response.text.strip()
        
        # Procesar y estructurar la respuesta
        structured_response = {
            "success": True,
            "data_id": request.data_id,
            "route_analysis": analysis,
            "configuration": route_data['metadata'],
            "ai_recommendations": ai_recommendations,
            "timestamp": route_data['created_at'].isoformat() if route_data['created_at'] else None,
            "model_used": "command-r-08-2024",
            "prompt_length": len(prompt)
        }
        
        logger.info(f"Recomendaciones generadas exitosamente para data_id: {request.data_id}")
        
        return structured_response
        
    except Exception as e:
        logger.error(f"Error generando recomendaciones con IA: {e}")
        
        # Respuesta de fallback si falla la IA
        fallback_response = {
            "success": False,
            "error": str(e),
            "fallback_recommendations": "No se pudieron generar recomendaciones con IA. Verifica la configuración de la API key y la conectividad.",
            "data_id": request.data_id
        }
        
        return fallback_response

@router.get("/test")
async def test_cohere_connection():
    """Endpoint para probar la conexión con Cohere"""
    try:
        if not os.getenv("COHERE_API_KEY"):
            return {"status": "error", "message": "COHERE_API_KEY no configurada"}
        
        # Test simple con CHAT API (CORREGIDO)
        response = cohere_client.chat(
            model='command-r-08-2024',
            message="Responde con 'OK' si puedes recibir este mensaje.",
            max_tokens=10,
            temperature=0.1
        )
        
        return {
            "status": "success", 
            "message": "Conexión con Cohere exitosa",
            "response": response.text.strip()
        }
        
    except Exception as e:
        return {"status": "error", "message": f"Error conectando con Cohere: {str(e)}"}
    
@router.get("/test-arcgis")
async def test_arcgis_connection():
    """Endpoint para probar conexión con ArcGIS"""
    try:
        from app.services.arcgis_service import arcgis_service
        
        result = arcgis_service.test_connection()
        
        if result["connected"]:
            return {
                "status": "success",
                "message": "✅ Conexión con ArcGIS exitosa",
                "details": result
            }
        else:
            return {
                "status": "error",
                "message": "❌ No se pudo conectar a ArcGIS",
                "error": result.get("error")
            }
    
    except Exception as e:
        return {
            "status": "error",
            "message": f"❌ Error probando ArcGIS: {str(e)}"
        }