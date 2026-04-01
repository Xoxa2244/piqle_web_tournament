import { Calendar, MapPin, Users, DollarSign, Trophy, ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { cn } from "../ui/utils";

interface TournamentCardProps {
  id: string;
  name: string;
  date: string;
  location: string;
  players: number;
  maxPlayers: number;
  price: number;
  status: 'Open' | 'Filling Fast' | 'Waitlist' | 'Closed';
  format: string;
  divisions: string[];
}

export function TournamentCard({
  id,
  name,
  date,
  location,
  players,
  maxPlayers,
  price,
  status,
  format,
  divisions
}: TournamentCardProps) {
  const fillPercentage = (players / maxPlayers) * 100;
  
  const statusStyles = {
    'Open': 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20',
    'Filling Fast': 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20',
    'Waitlist': 'bg-[var(--info)]/10 text-[var(--info)] border-[var(--info)]/20',
    'Closed': 'bg-[var(--muted)] text-muted-foreground border-border'
  }[status];

  return (
    <Link to={`/tournaments/${id}`} className="block mb-4">
      <motion.div
        whileHover={{ scale: 1.01, y: -2 }}
        whileTap={{ scale: 0.99 }}
        className="bg-card rounded-[var(--radius-card)] border border-border overflow-hidden hover:shadow-lg transition-all"
      >
        {/* Header with gradient */}
        <div className="relative h-20 bg-gradient-to-br from-[var(--brand-primary)]/10 via-[var(--brand-purple)]/10 to-[var(--brand-accent)]/10 p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg line-clamp-1 mb-1">{name}</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Trophy className="w-3.5 h-3.5" />
              {format}
            </div>
          </div>
          <Badge className={cn(statusStyles, "shrink-0")}>
            {status}
          </Badge>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Date & Location */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-4 h-4 text-[var(--brand-primary)]" />
              <span>{date}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4 text-[var(--brand-accent)]" />
              <span className="truncate">{location}</span>
            </div>
          </div>

          {/* Divisions */}
          <div className="flex flex-wrap gap-1.5">
            {divisions.slice(0, 3).map((division) => (
              <Badge
                key={division}
                variant="secondary"
                className="text-xs px-2 py-0.5"
              >
                {division}
              </Badge>
            ))}
            {divisions.length > 3 && (
              <Badge variant="secondary" className="text-xs px-2 py-0.5">
                +{divisions.length - 3}
              </Badge>
            )}
          </div>

          {/* Player Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{players} / {maxPlayers} players</span>
              </div>
              <div className="flex items-center gap-1 font-semibold text-[var(--brand-primary)]">
                <DollarSign className="w-4 h-4" />
                {price}
              </div>
            </div>
            <Progress value={fillPercentage} className="h-1.5" />
          </div>

          {/* CTA */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-sm text-muted-foreground">
              {maxPlayers - players} spots left
            </span>
            <div className="flex items-center gap-1 text-sm font-semibold text-[var(--brand-primary)]">
              View Details
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
