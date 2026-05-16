import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FixedExpenseOverview } from "../types";

interface FixedExpenseCardProps {
  fixedExpense: FixedExpenseOverview;
}

export function FixedExpenseCard({ fixedExpense }: FixedExpenseCardProps) {
  const tone = fixedExpense.overdueCount > 0 ? "over" : fixedExpense.scheduledCount > 0 ? "watch" : "stable";

  return (
    <Card>
      <CardHeader>
        <div className="metric-card-top">
          <CardDescription>Fixed Expenses</CardDescription>
          <Badge tone={tone}>{fixedExpense.overdueCount > 0 ? "확인" : "정상"}</Badge>
        </div>
        <CardTitle>이번 달 고정지출</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="fixed-overview">
          <strong>{fixedExpense.nextLabel}</strong>
          <p>{fixedExpense.nextDetail}</p>
          <div className="fixed-status-strip">
            <span>완료 {fixedExpense.processedCount}</span>
            <span>예정 {fixedExpense.scheduledCount}</span>
            <span>지연 {fixedExpense.overdueCount}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
