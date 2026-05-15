import { won } from "@/lib/format";
import type { TransactionRow } from "../types";

interface TransactionTableProps {
  rows: TransactionRow[];
}

const statusLabel = {
  posted: "반영",
  scheduled: "예정",
  review: "검토",
};

export function TransactionTable({ rows }: TransactionTableProps) {
  return (
    <section className="panel panel-light transaction-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow compact">Ledger</p>
          <h2>최근 지출</h2>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>일자</th>
              <th>계정</th>
              <th>분류</th>
              <th>내용</th>
              <th>상태</th>
              <th className="amount">금액</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.date}</td>
                <td>{row.account}</td>
                <td>{row.category}</td>
                <td>{row.merchant}</td>
                <td>
                  <span className={`status-pill status-${row.status}`}>
                    {statusLabel[row.status]}
                  </span>
                </td>
                <td className="amount">{won(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
