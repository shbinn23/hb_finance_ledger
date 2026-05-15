import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("ui-badge", {
  variants: {
    tone: {
      stable: "ui-badge-stable",
      watch: "ui-badge-watch",
      over: "ui-badge-over",
      neutral: "ui-badge-neutral",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
