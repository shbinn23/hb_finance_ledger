import psycopg2
from core.config import settings

def get_db_connection():
    return psycopg2.connect(
        host=settings.DB_HOST,
        dbname=settings.DB_NAME,
        user=settings.DB_USER,
        password=settings.DB_PASS,
        port=settings.DB_PORT,
        client_encoding="utf8",
    )
