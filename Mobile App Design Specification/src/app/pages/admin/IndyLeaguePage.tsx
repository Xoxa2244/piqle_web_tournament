import { ArrowLeft, Calendar, Users } from "lucide-react";
import { Link, useParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";

export function IndyLeaguePage() {
  const { id } = useParams();

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border p-4">
        <div className="flex items-center gap-3">
          <Link to={`/admin/tournaments/${id}`}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Indy League</h1>
        </div>
      </div>

      <div className="p-4">
        <Card className="p-8 text-center">
          <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-bold mb-2">Indy League Mode</h2>
          <p className="text-muted-foreground mb-4">
            Create match days, manage rosters, and track individual player standings
          </p>
          <Button className="rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)]">
            Create Match Day
          </Button>
        </Card>
      </div>
    </div>
  );
}
