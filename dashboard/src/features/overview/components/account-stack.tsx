import { CreditCard, Landmark } from "lucide-react";
import { wonCompact } from "@/lib/format";
import type { AccountBalance } from "../types";

interface AccountStackProps {
  accounts: AccountBalance[];
}

export function AccountStack({ accounts }: AccountStackProps) {
  return (
    <section className="panel panel-dark">
      <div className="section-heading">
        <div>
          <p className="eyebrow compact on-dark">Balance Sheet</p>
          <h2>주요 계정</h2>
        </div>
      </div>

      <div className="account-list">
        {accounts.map((account) => {
          const Icon = account.type === "asset" ? Landmark : CreditCard;
          return (
            <article className="account-row" key={account.name}>
              <span className="account-icon">
                <Icon size={16} />
              </span>
              <div>
                <strong>{account.name}</strong>
                <p>{account.detail}</p>
              </div>
              <b className={account.type === "liability" ? "negative" : ""}>
                {wonCompact(account.amount)}
              </b>
            </article>
          );
        })}
      </div>
    </section>
  );
}
