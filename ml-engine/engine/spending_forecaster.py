import torch
import numpy as np
import pandas as pd
from chronos import ChronosPipeline


class SpendingForecaster:
    """
    Amazon Chronos-T5 Foundation Model 기반 시계열 예측 엔진
    - Zero-shot: 별도 파인튜닝 없이 과거 지출 패턴으로 미래 예측
    - 90% 신뢰구간(0.05~0.95 퀀타일) 반환
    """

    def __init__(self, model_id: str = "amazon/chronos-t5-base"):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.pipeline = ChronosPipeline.from_pretrained(
            model_id,
            device_map=self.device,
            dtype=torch.bfloat16 if self.device == "cuda" else torch.float32,
        )

    def predict(self, df_train: pd.DataFrame, prediction_length: int, num_samples: int = 100) -> pd.DataFrame | None:
        """
        Zero-shot 추론 실행

        Args:
            df_train: ai_training_features.sql 결과 (ds, y 컬럼 필수)
            prediction_length: 예측할 일수 (이번 달 전체 = days_in_month)

        Returns:
            DataFrame(yhat, yhat_lower, yhat_upper) | None
        """
        if df_train is None or df_train.empty or len(df_train) < 5:
            return None

        context = torch.tensor(df_train["y"].values, dtype=torch.float32)

        with torch.no_grad():
            forecast = self.pipeline.predict(
                context,
                prediction_length,
                num_samples=num_samples,
            )

        # forecast[0]: shape [num_samples, prediction_length]
        forecast_np = forecast[0].numpy()
        low, median, high = np.quantile(forecast_np, [0.05, 0.5, 0.95], axis=0)

        return pd.DataFrame({
            "yhat":       median,
            "yhat_lower": low,
            "yhat_upper": high,
        })
