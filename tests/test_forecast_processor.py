import sys
import unittest
from pathlib import Path

try:
    import pandas as pd
except ModuleNotFoundError:
    pd = None

ROOT = Path(__file__).resolve().parent.parent
ML_ENGINE = ROOT / "ml-engine"
if str(ML_ENGINE) not in sys.path:
    sys.path.insert(0, str(ML_ENGINE))

if pd is None:
    ForecastProcessor = None
else:
    from engine.forecast_processor import ForecastProcessor


class ForecastProcessorTest(unittest.TestCase):
    @unittest.skipIf(pd is None, "pandas is required for ML forecast processor tests")
    def test_full_month_totals_do_not_add_actual_month_to_date(self):
        today = pd.Timestamp("2026-05-15")
        actual = pd.Series([999.0], index=[15])
        forecast_cumulative = pd.Series([day * 10.0 for day in range(1, 32)], index=range(1, 32))
        lower_cumulative = pd.Series([day * 8.0 for day in range(1, 32)], index=range(1, 32))
        upper_cumulative = pd.Series([day * 12.0 for day in range(1, 32)], index=range(1, 32))
        bounds = pd.DataFrame(
            {"lower": lower_cumulative, "upper": upper_cumulative},
            index=range(1, 32),
        )

        summary = ForecastProcessor.full_month_summary(
            actual=actual,
            ai_pure=forecast_cumulative,
            ai_bounds=bounds,
        )

        self.assertEqual(summary["actual_month_to_date"], 999.0)
        self.assertEqual(summary["projected_month_total"], 310.0)
        self.assertEqual(summary["lower_month_total"], 248.0)
        self.assertEqual(summary["upper_month_total"], 372.0)

    @unittest.skipIf(pd is None, "pandas is required for ML forecast processor tests")
    def test_full_month_curve_uses_model_cumulative_values_directly(self):
        forecast_cumulative = pd.Series([day * 10.0 for day in range(1, 32)], index=range(1, 32))

        curve = ForecastProcessor.full_month_curve(forecast_cumulative)

        self.assertEqual(curve.loc[1], 10.0)
        self.assertEqual(curve.loc[14], 140.0)
        self.assertEqual(curve.loc[31], 310.0)

    @unittest.skipIf(pd is None, "pandas is required for ML forecast processor tests")
    def test_variable_and_fixed_cumulative_are_separated(self):
        forecast = pd.DataFrame(
            {"yhat": [10.0, 20.0, 30.0], "yhat_lower": [8.0, 18.0, 28.0], "yhat_upper": [12.0, 22.0, 32.0]},
            index=[1, 2, 3],
        )
        fixed_profile = pd.DataFrame({"due_day": [2], "avg_amount": [100.0]})

        result = ForecastProcessor.calculate_daily_metrics(
            curr_f=forecast,
            fixed_profile=fixed_profile,
            baseline=0.0,
            days_in_month=3,
        )

        self.assertEqual(result["variable"], [10.0, 30.0, 60.0])
        self.assertEqual(result["fixed"], [0.0, 100.0, 100.0])
        self.assertEqual(result["projected"], [10.0, 130.0, 160.0])


if __name__ == "__main__":
    unittest.main()
