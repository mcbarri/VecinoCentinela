from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Vecino Centinela"
    app_env: str = "development"
    secret_key: str = "change-this-in-production"
    jwt_algorithm: str = "HS256"
    database_url: str = "sqlite:///./dev.db"
    redis_url: str = "redis://localhost:6379/0"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    allowed_origins: list[str] = ["http://localhost:3000"]
    superadmin_email: str = "mcbarri.gt@gmail.com"
    superadmin_password: str = "change-this-in-development"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
