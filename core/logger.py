import logging
import sys

def setup_logger(name: str = "fortress"):
    logger = logging.getLogger(name)

    # 로거가 중복 생성되는 것을 방지
    if not logger.handlers:
        logger.setLevel(logging.INFO)

        # Console Handler (표준 출력)
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            '[%(asctime)s] %(levelname)s [%(name)s.%(funcName)s:%(lineno)d] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger

# 싱글톤(Singleton) 인스턴스
logger = setup_logger()