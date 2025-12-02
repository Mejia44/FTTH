# backend/app/api/data.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import psycopg2
from psycopg2.extras import Json, RealDictCursor
from dotenv import load_dotenv

# Cargar .env ANTES de usarlo
load_dotenv()

router = APIRouter()

class CollectPayload(BaseModel):
    geojson: dict
    step_m: int = 20
    meta: dict = {}


def _get_conn():
    return psycopg2.connect(
        host=os.environ.get("POSTGRES_HOST"),
        port=int(os.environ.get("POSTGRES_PORT", 5432)),
        dbname=os.environ.get("POSTGRES_DB"),
        user=os.environ.get("POSTGRES_USER"),
        password=os.environ.get("POSTGRES_PASSWORD"),
        sslmode='require'
    )

@router.post("/collect")
def collect_data(payload: CollectPayload):
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO collected_data (config_id, geojson, step_m, metadata)
            VALUES (%s, %s, %s, %s)
            RETURNING id;
            """,
            (
                None,
                Json(payload.geojson),
                payload.step_m,
                Json(payload.meta),
            )
        )
        inserted_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
        return {"ok": True, "id": inserted_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
