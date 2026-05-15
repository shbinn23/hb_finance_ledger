import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

class AnomalyFeatureEngineer:
    """
    ML 모델 학습을 위한 데이터 전처리 및 피처 엔지니어링 전담 클래스
    """
    def __init__(self):
        self.scaler = StandardScaler()

    def transform(self, df: pd.DataFrame):
        if df is None or len(df) < 30:
            return None, None

        df = df.copy()
        df['transaction_date'] = pd.to_datetime(df['transaction_date'])

        # 💡 [Fix 1] 카테고리(원-핫 인코딩) 완전 제거:
        # 특정 카테고리의 발생 빈도가 낮다는 이유만으로 AI가 고립(오탐)시키는 현상 원천 차단
        features = df[['amount', 'day_of_month', 'day_of_week', 'is_weekend', 'is_holiday']]

        # 💡 [Fix 2] 역효과 난 로그 변환 제거 및 순수 금액 스케일링 복구
        X = features.copy()
        X['amount'] = self.scaler.fit_transform(X[['amount']])

        return X, df

class AnomalyDetector:
    """
    다차원 지출 데이터를 분석하여 비정상 패턴(이상치)을 탐지하는 ML 엔진
    """
    def __init__(self, contamination=0.05):
        self.model = IsolationForest(contamination=contamination, random_state=42)
        self.feature_engineer = AnomalyFeatureEngineer()

    def detect_anomalies(self, df: pd.DataFrame, today: pd.Timestamp) -> pd.DataFrame:
        X, df_processed = self.feature_engineer.transform(df)

        if X is None:
            return pd.DataFrame()

        self.model.fit(X)

        df_processed['anomaly_score'] = self._calculate_anomaly_scores(X)
        df_processed['is_anomaly'] = self.model.predict(X) == -1

        # 💡 [Fix 3] 비즈니스 룰 방어선 (Heuristic Filter) 구축
        # 5,000원 미만의 초소액 결제(톨비, 자판기 등)는 재무 리스크가 없으므로 AI 판단을 무시하고 강제 정상(면책) 처리
        micro_tx_mask = df_processed['amount'] < 5000
        df_processed.loc[micro_tx_mask, 'is_anomaly'] = False
        df_processed.loc[micro_tx_mask, 'anomaly_score'] = 0.0

        return self._filter_current_month(df_processed, today)

    def _calculate_anomaly_scores(self, X):
        decision_scores = self.model.decision_function(X)
        min_score, max_score = decision_scores.min(), decision_scores.max()

        if max_score == min_score:
            return np.zeros(len(X))

        anomaly_score = (max_score - decision_scores) / (max_score - min_score) * 100
        return anomaly_score.round(1)

    def _filter_current_month(self, df: pd.DataFrame, today: pd.Timestamp):
        curr_m = today.strftime('%Y-%m')
        return df[df['transaction_date'].dt.strftime('%Y-%m') == curr_m]