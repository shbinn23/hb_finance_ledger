import pandas as pd


class ForecastProcessor:
    """시계열 예측 결과 후처리 및 신뢰 구간 연산 전담"""

    @staticmethod
    def apply_postprocessing_rules(curr_f, actual, past_months, df_train, fixed_profile, today):
        days_in_month = today.days_in_month
        baseline, hist_min = ForecastProcessor._prepare_baselines(df_train, past_months)
        metrics = ForecastProcessor.calculate_daily_metrics(
            curr_f, fixed_profile, baseline, days_in_month
        )

        ai_pure = pd.Series(metrics["projected"], index=range(1, days_in_month + 1))
        ai_bounds = pd.DataFrame(
            {'upper': metrics["upper"], 'lower': metrics["lower"]},
            index=range(1, days_in_month + 1)
        )
        components = pd.DataFrame(
            {'variable': metrics["variable"], 'fixed': metrics["fixed"]},
            index=range(1, days_in_month + 1)
        )
        projected = ForecastProcessor._generate_projected_path(
            actual, metrics["projected"], today, days_in_month
        )
        return ai_pure, ai_bounds, projected, components

    @staticmethod
    def _prepare_baselines(df_train, past_months):
        baseline = df_train['y'].abs().mean() * 0.7 if not df_train.empty else 0
        hist_min = past_months.min(axis=1) if not past_months.empty else pd.Series(dtype=float)
        return baseline, hist_min

    @staticmethod
    def calculate_daily_metrics(curr_f, fixed_profile, baseline, days_in_month):
        pure_pred, pure_upper, pure_lower = [], [], []
        variable_pred, fixed_pred = [], []
        cum_var, cum_fixed, cum_upper, cum_lower = 0, 0, 0, 0

        for d in range(1, days_in_month + 1):
            val_yhat = max(curr_f.loc[d, 'yhat'], baseline) if d in curr_f.index else baseline
            daily_fix = fixed_profile[fixed_profile['due_day'] == d]['avg_amount'].sum() if not fixed_profile.empty else 0

            cum_var += val_yhat
            cum_fixed += daily_fix
            cum_pure = cum_var + cum_fixed
            variable_pred.append(cum_var)
            fixed_pred.append(cum_fixed)
            pure_pred.append(cum_pure)

            if d in curr_f.index:
                daily_upper_delta = curr_f.loc[d, 'yhat_upper'] - curr_f.loc[d, 'yhat']
                daily_lower_delta = curr_f.loc[d, 'yhat'] - curr_f.loc[d, 'yhat_lower']
            else:
                daily_upper_delta = baseline * 0.2
                daily_lower_delta = baseline * 0.2

            cum_upper += daily_upper_delta
            cum_lower += daily_lower_delta

            upper_val = cum_pure + cum_upper
            lower_val = cum_pure - cum_lower

            if pure_lower:
                lower_val = max(pure_lower[-1], lower_val)
                upper_val = max(pure_upper[-1], upper_val)

            pure_lower.append(lower_val)
            pure_upper.append(upper_val)

        return {
            "projected": pure_pred,
            "upper": pure_upper,
            "lower": pure_lower,
            "variable": variable_pred,
            "fixed": fixed_pred,
        }

    @staticmethod
    def _generate_projected_path(actual, ai_pure_list, today, days_in_month):
        if actual.empty:
            return pd.Series(ai_pure_list, index=range(1, days_in_month + 1))
        projected_path = [actual.iloc[-1]]
        for d in range(today.day + 1, days_in_month + 1):
            delta = ai_pure_list[d-1] - ai_pure_list[d-2] if d > 1 else ai_pure_list[d-1]
            projected_path.append(projected_path[-1] + delta)
        return pd.Series(projected_path, index=range(today.day, days_in_month + 1))

    @staticmethod
    def full_month_curve(cumulative_forecast):
        return cumulative_forecast.copy()

    @staticmethod
    def full_month_summary(actual, ai_pure, ai_bounds):
        actual_month_to_date = float(actual.iloc[-1]) if not actual.empty else 0.0
        return {
            "actual_month_to_date": actual_month_to_date,
            "projected_month_total": float(ai_pure.iloc[-1]) if not ai_pure.empty else 0.0,
            "lower_month_total": float(ai_bounds["lower"].iloc[-1]) if not ai_bounds.empty else 0.0,
            "upper_month_total": float(ai_bounds["upper"].iloc[-1]) if not ai_bounds.empty else 0.0,
            "projected_path": ForecastProcessor.full_month_curve(ai_pure),
            "lower_projected_path": ForecastProcessor.full_month_curve(ai_bounds["lower"]),
            "upper_projected_path": ForecastProcessor.full_month_curve(ai_bounds["upper"]),
        }
