import { ArrowLeft, Users, Trophy, Settings, BarChart3 } from "lucide-react";
import { Link, useParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { motion } from "motion/react";

export function TournamentAdminPage() {
  const { id } = useParams();

  const adminSections = [
    {
      title: "Divisions & Teams",
      icon: Users,
      description: "Manage divisions, teams, and players",
      path: `/admin/tournaments/${id}/divisions`,
      gradient: "from-[var(--brand-primary)] to-[var(--brand-purple)]"
    },
    {
      title: "Scoring",
      icon: Trophy,
      description: "Enter scores and manage matches",
      path: `/admin/tournaments/${id}/scoring`,
      gradient: "from-[var(--brand-accent)] to-[var(--brand-purple)]"
    },
    {
      title: "Analytics",
      icon: BarChart3,
      description: "View tournament statistics",
      path: `/admin/tournaments/${id}/analytics`,
      gradient: "from-[var(--brand-secondary)] to-[var(--brand-primary)]"
    },
    {
      title: "Settings",
      icon: Settings,
      description: "Configure tournament settings",
      path: `/admin/tournaments/${id}/settings`,
      gradient: "from-[var(--brand-purple)] to-[var(--brand-accent)]"
    }
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border p-4">
        <div className="flex items-center gap-3">
          <Link to="/organizer">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Tournament Admin</h1>
            <p className="text-sm text-muted-foreground">Spring Championship 2026</p>
          </div>
          <Badge variant="secondary">Live</Badge>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {adminSections.map((section, index) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Link to={section.path}>
              <Card className="p-4 hover:shadow-lg transition-all">
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
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
