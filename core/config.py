from pathlib import Path
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # [Paths] pathlib을 통한 절대 경로 통제 (이 파일 기준 2단계 위가 Root)
    PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
    DATA_DIR: Path = PROJECT_ROOT / "data"
    SQL_DIR: Path = PROJECT_ROOT / "sql" / "spending"

    # [Database] .env에서 주입받을 변수들
    DB_HOST: str = "localhost"
    DB_NAME: str = "ledger"
    DB_USER: str = "admin"
    DB_PASS: str = Field(default="admin", validation_alias=AliasChoices("DB_PASS", "DB_PASSWORD"))
    DB_PORT: int = 5432

    # [App Settings] 지출 관리 원칙 한도 (기본값)
    MONTHLY_SPEND_LIMIT: int = 2100000

    # [ML Engine] 외부 ML API 엔드포인트
    ML_ENGINE_URL: str = "http://localhost:8000"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def db_url(self) -> str:
        """SQLAlchemy 엔진에 주입할 URL을 동적으로 생성"""
        return f"postgresql://{self.DB_USER}:{self.DB_PASS}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

# 싱글톤(Singleton) 인스턴스 생성: 앱 전체에서 이 객체 하나만 Import 하여 사용
settings = Settings()
