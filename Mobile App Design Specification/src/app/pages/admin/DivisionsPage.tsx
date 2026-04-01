import { ArrowLeft, Plus, Users } from "lucide-react";
import { Link, useParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";

export function DivisionsPage() {
  const { id } = useParams();

  const divisions = [
    { name: "Open", teams: 8, players: 32, status: "Active" },
    { name: "4.0+", teams: 8, players: 32, status: "Active" },
    { name: "3.5", teams: 6, players: 24, status: "Draft" },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border p-4">
        <div className="flex items-center gap-3">
          <Link to={`/admin/tournaments/${id}`}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold flex-1">Divisions</h1>
          <Button size="icon" className="rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)]">
            <Plus className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {divisions.map((division) => (
          <Card key={division.name} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-lg">{division.name}</h3>
              <Badge variant={division.status === "Active" ? "default" : "secondary"}>
                {division.status}
              </Badge>
            </div>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {division.teams} teams
              </div>
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {division.players} players
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
