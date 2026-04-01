import { Shield, Users, Trophy, Key, Activity } from "lucide-react";
import { motion } from "motion/react";
import { Card } from "../../components/ui/card";
import { Link } from "react-router";

export function SuperadminPage() {
  const adminSections = [
    {
      title: "Tournaments",
      icon: Trophy,
      description: "Manage all tournaments",
      gradient: "from-[var(--brand-primary)] to-[var(--brand-purple)]"
    },
    {
      title: "Users",
      icon: Users,
      description: "User management and moderation",
      gradient: "from-[var(--brand-accent)] to-[var(--brand-purple)]"
    },
    {
      title: "Partners",
      icon: Key,
      description: "API partners and integrations",
      gradient: "from-[var(--brand-secondary)] to-[var(--brand-primary)]"
    },
    {
      title: "System Logs",
      icon: Activity,
      description: "View system activity and logs",
      gradient: "from-[var(--brand-purple)] to-[var(--brand-accent)]"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--brand-purple)]/5 via-background to-[var(--brand-primary)]/5 pb-20">
      <div className="p-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--brand-purple)] to-[var(--brand-accent)] flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Superadmin</h1>
            <p className="text-sm text-muted-foreground">Platform Management</p>
          </div>
        </div>

        <div className="space-y-3">
          {adminSections.map((section, index) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="p-4 hover:shadow-lg transition-all cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${section.gradient} flex items-center justify-center shrink-0`}>
                    <section.icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{section.title}</h3>
                    <p className="text-sm text-muted-foreground">{section.description}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
