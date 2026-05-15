"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpen,
  Brain,
  BrainCircuit,
  CreditCard,
  LayoutDashboard,
  PieChart,
  TrendingUp,
} from "lucide-react";

const tabs = [
  { id: "overview", label: "Overview", Icon: LayoutDashboard },
  { id: "ledger", label: "가계부", Icon: BookOpen },
  { id: "trend", label: "지출 추이", Icon: TrendingUp },
  { id: "budget", label: "예산 관리", Icon: PieChart },
  { id: "assets", label: "자산·카드", Icon: CreditCard },
  { id: "analysis", label: "AI 분석", Icon: Brain },
  { id: "ml", label: "ML 인사이트", Icon: BrainCircuit },
  { id: "habits", label: "습관 관리", Icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();
  const active = tabs.find(t => pathname.startsWith(`/${t.id}`))?.id ?? "overview";

  return (
    <aside className="sidebar">
      <div className="sidebar-inner">
        <div className="brand-block">
          <Link href="/overview" className="brand-mark" aria-label="Piggy Ledger overview">
            <span>PL</span>
            <div>
              <strong>Piggy Ledger</strong>
              <p>Whooing command center</p>
            </div>
          </Link>
        </div>

        <nav className="nav-list" aria-label="주요 화면">
          {tabs.map(({ id, label, Icon }) => (
            <Link
              key={id}
              href={`/${id}`}
              className={`nav-item ${active === id ? "active" : ""}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-foot">
          <p>Portfolio build</p>
          <strong>2026-ready finance OS</strong>
        </div>
      </div>
    </aside>
  );
}
