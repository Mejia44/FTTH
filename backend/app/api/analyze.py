from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from shapely.geometry import shape, LineString, mapping
from pyproj import Transformer
import math

router = APIRouter()

class RouteIn(BaseModel):
    geojson: dict  # LineString GeoJSON
    step_m: float = 20.0  # distancia en metros entre muestras

# transformers (WGS84 <-> WebMercator (m))
_to_3857 = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
_to_4326 = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)

def project_linestring_to_3857(linestring: LineString) -> LineString:
    pts = [(x, y) for x, y in linestring.coords]
    pts_3857 = [_to_3857.transform(x, y) for x, y in pts]  # lon,lat -> x,y metros
    return LineString(pts_3857)

def reproject_point_to_latlon(pt_3857):
    x, y = pt_3857
    lon, lat = _to_4326.transform(x, y)
    return lat, lon

def sample_linestring_by_meters(line: LineString, step_m: float):
    # linea espectante en metros (e.g. EPSG:3857)
    length = line.length  # en metros
    if length == 0:
        return []
    n = max(2, int(math.ceil(length / step_m)) + 1)
    samples = []
    for i in range(n):
        dist = min(i * step_m, length)
        p = line.interpolate(dist)
        samples.append((p.x, p.y))  # x,y en metros
    # also ensure last point is the true end
    end = line.coords[-1]
    if samples[-1] != end:
        samples.append(end)
    return samples

@router.post("/submit")
def analyze_route(payload: RouteIn):
    try:
        geom = shape(payload.geojson)
    except Exception as e:
        raise HTTPException(status_code=400, detail="GeoJSON inválido: " + str(e))

    if not isinstance(geom, LineString):
        raise HTTPException(status_code=400, detail="Se requiere GeoJSON de tipo LineString")

    # 1) proyectar a metros
    line_3857 = project_linestring_to_3857(geom)

    # 2) muestrear cada X metros
    samples_m = sample_linestring_by_meters(line_3857, payload.step_m)

    # 3) reprojectar las muestras a lat/lon para devolver
    samples_latlon = [reproject_point_to_latlon((x, y)) for x, y in samples_m]

    # 4) preparar salida mínima (más adelante aquí llamaremos a OpenTopoData/Overpass)
    response = {
        "original_length_m": round(line_3857.length, 2),
        "n_samples": len(samples_latlon),
        "samples": [{"lat": round(lat, 6), "lon": round(lon, 6)} for lat, lon in samples_latlon]
    }
    return response
