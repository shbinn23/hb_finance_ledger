from sqlalchemy import create_engine
from core.config import settings
from core.logger import logger

def get_engine():
    """
    PostgreSQL 연결을 위한 SQLAlchemy Engine을 생성합니다.
    (config.py의 Settings 객체를 단일 진실 공급원으로 사용)
    """
    try:
        # settings.db_url 프로퍼티를 통해 동적으로 조합된 URL 사용
        engine = create_engine(settings.db_url, pool_pre_ping=True)
        return engine
    except Exception as e:
        logger.critical(f"❌ DB 엔진 생성 실패: 환경 변수(DB_URL)를 확인하십시오. 에러: {e}")
        raise e