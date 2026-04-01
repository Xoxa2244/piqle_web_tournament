import { ChevronLeft } from "lucide-react";
import { Link, useParams, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { motion } from "motion/react";

export function ScoreboardPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const standings = [
    { rank: 1, team: "Thunder Strike", wins: 8, losses: 1, points: 48, streak: "W5" },
    { rank: 2, team: "Court Kings", wins: 7, losses: 2, points: 45, streak: "W3" },
    { rank: 3, team: "Net Ninjas", wins: 6, losses: 3, points: 42, streak: "L1" },
    { rank: 4, team: "Pickle Pros", wins: 5, losses: 4, points: 38, streak: "W2" },
    { rank: 5, team: "Ace Squad", wins: 4, losses: 5, points: 35, streak: "L2" },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <Link to={`/tournaments/${id}`}>
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] bg-clip-text text-transparent font-bold">Scoreboard</h1>
            <p className="text-sm text-muted-foreground">Spring Championship 2026</p>
          </div>
        </div>

        <Tabs defaultValue="standings" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="standings">Standings</TabsTrigger>
            <TabsTrigger value="bracket">Bracket</TabsTrigger>
            <TabsTrigger value="matches">Matches</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="p-4">
        <Tabs defaultValue="standings">
          <TabsContent value="standings" className="space-y-3 mt-0">
            {/* Division Selector */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {['Open', '4.0+', '3.5', '3.0'].map((div) => (
                <Button
                  key={div}
                  variant={div === 'Open' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full whitespace-nowrap"
                >
                  {div}
                </Button>
              ))}
            </div>

            {/* Standings Table */}
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[var(--muted)]">
                    <tr className="text-left text-sm">
                      <th className="p-3 font-semibold">#</th>
                      <th className="p-3 font-semibold">Team</th>
                      <th className="p-3 font-semibold text-center">W</th>
                      <th className="p-3 font-semibold text-center">L</th>
                      <th className="p-3 font-semibold text-center">PTS</th>
                      <th className="p-3 font-semibold">Streak</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {standings.map((team, index) => (
                      <motion.tr
                        key={team.rank}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="hover:bg-[var(--surface-elevated)] transition-colors"
                      >
                        <td className="p-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                            team.rank === 1 ? 'bg-yellow-500/10 text-yellow-600' :
                            team.rank === 2 ? 'bg-gray-400/10 text-gray-600' :
                            team.rank === 3 ? 'bg-orange-600/10 text-orange-700' :
                            'bg-[var(--muted)] text-muted-foreground'
                          }`}>
                            {team.rank}
                          </div>
                        </td>
                        <td className="p-3 font-medium">{team.team}</td>
                        <td className="p-3 text-center font-semibold">{team.wins}</td>
                        <td className="p-3 text-center font-semibold text-muted-foreground">{team.losses}</td>
                        <td className="p-3 text-center font-bold text-[var(--brand-primary)]">{team.points}</td>
                        <td className="p-3">
                          <Badge variant={team.streak.startsWith('W') ? 'default' : 'secondary'} className="text-xs">
                            {team.streak}
                          </Badge>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="bracket" className="mt-0">
            <Card className="p-8 text-center">
              <div className="text-6xl mb-4">🏆</div>
              <h3 className="font-semibold mb-2">Bracket View</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Tournament bracket will appear here once playoffs begin
              </p>
              <Button variant="outline" className="rounded-full">
                View Full Bracket
              </Button>
            </Card>
          </TabsContent>

          <TabsContent value="matches" className="mt-0">
            <Card className="p-8 text-center">
              <div className="text-6xl mb-4">📅</div>
              <h3 className="font-semibold mb-2">Match Schedule</h3>
              <p className="text-sm text-muted-foreground">
                Match schedule coming soon
              </p>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}