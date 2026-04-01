import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../ui/utils";

interface StatsCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
}

export function StatsCard({ icon: Icon, label, value, change, trend }: StatsCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="bg-card rounded-[var(--radius-card)] p-4 border border-border hover:shadow-lg transition-shadow"
    >
      <div className="flex items-start justify-between mb-2">
        <div className={cn(
          "p-2 rounded-xl",
          trend === 'up' && "bg-[var(--success)]/10",
          trend === 'down' && "bg-[var(--destructive)]/10",
          trend === 'neutral' && "bg-[var(--muted)]"
        )}>
          <Icon className={cn(
            "w-4 h-4",
            trend === 'up' && "text-[var(--success)]",
            trend === 'down' && "text-[var(--destructive)]",
            trend === 'neutral' && "text-muted-foreground"
          )} />
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn(
          "flex items-center gap-1 text-xs font-medium",
          trend === 'up' && "text-[var(--success)]",
          trend === 'down' && "text-[var(--destructive)]",
          trend === 'neutral' && "text-muted-foreground"
        )}>
          <TrendIcon className="w-3 h-3" />
          {change}
        </div>
      </div>
    </motion.div>
  );
}
