from pydantic_settings import BaseSettings
from functools import lru_cache
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    # PostgreSQL
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "ftth"
    POSTGRES_USER: str = "***"
    POSTGRES_PASSWORD: str = "***"
    
    # APIs - SIN valores hardcoded
    COHERE_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    ARCGIS_API_KEY: str = ""
    
    class Config:
        env_file = "../.env"
        case_sensitive = False

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()