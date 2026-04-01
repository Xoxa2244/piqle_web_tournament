import { DollarSign, TrendingUp, Users, Calendar, Plus } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Link } from "react-router";

export function OrganizerDashboard() {
  const stats = {
    revenue: 12450,
    tournaments: 8,
    players: 342,
    avgRating: 4.8
  };

  const upcomingTournaments = [
    { id: "1", name: "Spring Championship", date: "Mar 15-17", players: 124, revenue: 9300 },
    { id: "2", name: "Coastal Classic", date: "Mar 22-24", players: 96, revenue: 8160 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-[var(--surface-elevated)] pb-20">
      {/* Header */}
      <div className="p-4 pb-6 bg-gradient-to-br from-[var(--brand-primary)]/10 via-[var(--brand-purple)]/10 to-[var(--brand-accent)]/10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl mb-1">Organizer Dashboard</h1>
            <p className="text-sm text-muted-foreground">Manage your tournaments</p>
          </div>
          <Link to="/admin/tournaments/new">
            <Button size="icon" className="rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)]">
              <Plus className="w-5 h-5" />
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <DollarSign className="w-8 h-8 mb-2 text-[var(--brand-secondary)]" />
            <div className="text-2xl font-bold">${stats.revenue.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Revenue</div>
          </Card>
          <Card className="p-4">
            <Calendar className="w-8 h-8 mb-2 text-[var(--brand-primary)]" />
            <div className="text-2xl font-bold">{stats.tournaments}</div>
            <div className="text-xs text-muted-foreground">Tournaments</div>
          </Card>
          <Card className="p-4">
            <Users className="w-8 h-8 mb-2 text-[var(--brand-accent)]" />
            <div className="text-2xl font-bold">{stats.players}</div>
            <div className="text-xs text-muted-foreground">Total Players</div>
          </Card>
          <Card className="p-4">
            <TrendingUp className="w-8 h-8 mb-2 text-[var(--brand-purple)]" />
            <div className="text-2xl font-bold">⭐ {stats.avgRating}</div>
            <div className="text-xs text-muted-foreground">Avg Rating</div>
          </Card>
        </div>
      </div>

      <div className="p-4">
        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="upcoming" className="flex-1">Upcoming</TabsTrigger>
            <TabsTrigger value="past" className="flex-1">Past</TabsTrigger>
            <TabsTrigger value="draft" className="flex-1">Drafts</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-3 mt-4">
            {upcomingTournaments.map((tournament, index) => (
              <motion.div
                key={tournament.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Link to={`/admin/tournaments/${tournament.id}`}>
                  <Card className="p-4 hover:shadow-lg transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-lg">{tournament.name}</h3>
                        <p className="text-sm text-muted-foreground">{tournament.date}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        {tournament.players} players
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-muted-foreground" />
                        ${tournament.revenue.toLocaleString()}
                      </div>
                    </div>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </TabsContent>

          <TabsContent value="past" className="mt-4">
            <Card className="p-8 text-center">
              <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <h3 className="font-semibold mb-2">Past Tournaments</h3>
              <p className="text-sm text-muted-foreground">Your completed tournaments will appear here</p>
            </Card>
          </TabsContent>

          <TabsContent value="draft" className="mt-4">
            <Card className="p-8 text-center">
              <Plus className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <h3 className="font-semibold mb-2">No Drafts</h3>
              <p className="text-sm text-muted-foreground mb-4">Create a new tournament to get started</p>
              <Link to="/admin/tournaments/new">
                <Button className="rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)]">
                  Create Tournament
                </Button>
              </Link>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
