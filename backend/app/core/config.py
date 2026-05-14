from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "DeviceJoin IOT Platform"
    debug: bool = True

    database_url: str = "postgresql+asyncpg://devicejoin:devicejoin123@localhost:5432/devicejoin"
    redis_url: str = "redis://localhost:6379/0"

    llm_api_key: str = ""
    llm_api_base: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o"

    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 50

    vector_top_k: int = 5
    vector_similarity_threshold: float = 0.7

    model_config = {"env_file": ".env"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
