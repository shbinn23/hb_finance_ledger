import type { ReactNode } from "react";

interface PanelProps {
  children: ReactNode;
  className?: string;
  tone?: "light" | "dark" | "cream";
}

export function Panel({ children, className = "", tone = "light" }: PanelProps) {
  return (
    <section className={`panel panel-${tone} ${className}`}>
      {children}
    </section>
  );
}
