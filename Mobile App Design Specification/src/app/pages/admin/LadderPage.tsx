import { ArrowLeft, TrendingUp } from "lucide-react";
import { Link, useParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";

export function LadderPage() {
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
          <h1 className="text-xl font-bold">Ladder League</h1>
        </div>
      </div>

      <div className="p-4">
        <Card className="p-8 text-center">
          <TrendingUp className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-bold mb-2">Ladder League Mode</h2>
          <p className="text-muted-foreground mb-4">
            Manage weekly ladder rounds, pods, and advancement
          </p>
          <Button className="rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)]">
            Initialize Ladder
          </Button>
        </Card>
      </div>
    </div>
  );
}
