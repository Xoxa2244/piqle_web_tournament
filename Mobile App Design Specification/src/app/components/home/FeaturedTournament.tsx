import { Calendar, MapPin, Users, ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { Badge } from "../ui/badge";
import { ImageWithFallback } from "../figma/ImageWithFallback";

interface FeaturedTournamentProps {
  id: string;
  name: string;
  date: string;
  location: string;
  players: number;
  image: string;
  status: 'Open' | 'Filling Fast' | 'Waitlist' | 'Closed';
}

const tournamentImages = [
  "https://images.unsplash.com/photo-1696661115319-a9b6801e2571?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZW5uaXMlMjB0b3VybmFtZW50JTIwY2hhbXBpb25zaGlwfGVufDF8fHx8MTc3MjEzNzk0OHww&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1761644658016-324918bc373c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaWNrbGViYWxsJTIwdG91cm5hbWVudCUyMGNvdXJ0fGVufDF8fHx8MTc3MjEzNzk0OHww&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1582275053212-371003820068?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzcG9ydHMlMjBvdXRkb29yJTIwZmFjaWxpdHl8ZW58MXx8fHwxNzcyMTM3OTUwfDA&ixlib=rb-4.1.0&q=80&w=1080"
];

export function FeaturedTournament({ id, name, date, location, players, status }: FeaturedTournamentProps) {
  const statusColor = {
    'Open': 'bg-[var(--success)]/10 text-[var(--success)]',
    'Filling Fast': 'bg-[var(--warning)]/10 text-[var(--warning)]',
    'Waitlist': 'bg-[var(--info)]/10 text-[var(--info)]',
    'Closed': 'bg-[var(--muted)] text-muted-foreground'
  }[status];

  const imageIndex = parseInt(id) % tournamentImages.length;

  return (
    <Link to={`/tournaments/${id}`}>
      <motion.div
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className="bg-card rounded-[var(--radius-card)] overflow-hidden border border-border hover:shadow-lg transition-shadow"
      >
        <div className="relative h-40 bg-gradient-to-br from-[var(--muted)] to-[var(--surface-elevated)]">
          <ImageWithFallback
            src={tournamentImages[imageIndex]}
            alt={name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          <Badge className={`absolute top-3 right-3 ${statusColor} border-0`}>
            {status}
          </Badge>
        </div>
        <div className="p-4">
          <h4 className="font-semibold mb-2 line-clamp-1">{name}</h4>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {date}
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              {location}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                {players} players
              </div>
              <ArrowRight className="w-4 h-4 text-[var(--brand-primary)]" />
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
