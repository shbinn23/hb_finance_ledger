import { won } from "@/lib/format";
import type { CategorySlice } from "../types";

interface CategoryBoardProps {
  categories: CategorySlice[];
}

export function CategoryBoard({ categories }: CategoryBoardProps) {
  return (
    <section className="panel panel-light">
      <div className="section-heading">
        <div>
          <p className="eyebrow compact">Categories</p>
          <h2>지출 구성</h2>
        </div>
      </div>

      <div className="category-stack">
        {categories.map((category) => (
          <div className="category-row" key={category.name}>
            <div className="category-meta">
              <span style={{ background: category.tone }} />
              <div>
                <strong>{category.name}</strong>
                <p>{category.share.toFixed(1)}%</p>
              </div>
            </div>
            <div className="category-value">
              <strong>{won(category.amount)}</strong>
              <div className="category-bar">
                <i style={{ width: `${category.share}%`, background: category.tone }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
