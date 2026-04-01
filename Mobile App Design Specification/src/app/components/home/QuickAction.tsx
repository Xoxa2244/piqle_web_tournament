import { LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { motion } from "motion/react";

interface QuickActionProps {
  icon: LucideIcon;
  label: string;
  description: string;
  to: string;
  gradient: string;
}

export function QuickAction({ icon: Icon, label, description, to, gradient }: QuickActionProps) {
  return (
    <Link to={to}>
      <motion.div
        whileHover={{ scale: 1.03, y: -3 }}
        whileTap={{ scale: 0.97 }}
        className="relative overflow-hidden rounded-[var(--radius-card)] p-4 h-24 bg-card border border-border hover:shadow-lg transition-shadow"
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-[0.08]`} />
        <div className="relative z-10 flex flex-col justify-between h-full">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-semibold">{label}</div>
            <div className="text-xs text-muted-foreground">{description}</div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
