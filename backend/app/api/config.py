# backend/app/api/config_db.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os, json
import psycopg2
from psycopg2.extras import Json

router = APIRouter()
class ConfigIn(BaseModel):
    estudio_factibilidad: int
    split: str | None = None
    enfoque: str | None = None
    arquitectura: str | None = None
    subconfig: str | None = None
    user_id: int | None = None
    name: str | None = None

def get_conn():
    return psycopg2.connect(
        host=os.getenv('POSTGRES_HOST','db'),
        port=int(os.getenv('POSTGRES_PORT','5432')),
        dbname=os.getenv('POSTGRES_DB','ftth'),
        user=os.getenv('POSTGRES_USER','***'),
        password=os.getenv('POSTGRES_PASSWORD','***')
    )

@router.post("/save")
def save_config(cfg: ConfigIn):
    payload = cfg.dict()
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO user_configs (user_id, name, config) VALUES (%s, %s, %s) RETURNING id;",
            (payload.get('user_id'), payload.get('name'), Json(payload))
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
        return {"ok": True, "id": new_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
