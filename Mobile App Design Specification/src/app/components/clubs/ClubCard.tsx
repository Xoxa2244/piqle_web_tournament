import { MapPin, Users, Calendar, ArrowRight, Check, Clock } from "lucide-react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ImageWithFallback } from "../figma/ImageWithFallback";

interface ClubCardProps {
  id: string;
  name: string;
  location: string;
  members: number;
  distance: string;
  image: string;
  amenities: string[];
  nextEvent: string;
  membershipType: 'Member' | 'Pending' | null;
}

const clubImages = [
  "https://images.unsplash.com/photo-1761775446030-5e1fdd4166a5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzcG9ydHMlMjBjbHViJTIwZmFjaWxpdHl8ZW58MXx8fHwxNzcyMTM4MTAyfDA&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1770046519453-83daad039dc3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZW5uaXMlMjBjbHViJTIwb3V0ZG9vcnxlbnwxfHx8fDE3NzIxMzgxMDN8MA&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1764605062059-745d0581e5f4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiZWFjaCUyMHNwb3J0cyUyMHZlbnVlfGVufDF8fHx8MTc3MjEzODEwMnww&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1771909720952-3f6aea71ab4e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbmRvb3IlMjBzcG9ydHMlMjBmYWNpbGl0eXxlbnwxfHx8fDE3NzIxMDY3NTJ8MA&ixlib=rb-4.1.0&q=80&w=1080"
];

export function ClubCard({
  id,
  name,
  location,
  members,
  distance,
  amenities,
  nextEvent,
  membershipType
}: ClubCardProps) {
  const imageIndex = parseInt(id) % clubImages.length;

  return (
    <Link to={`/clubs/${id}`} className="block mb-4">
      <motion.div
        whileHover={{ scale: 1.01, y: -2 }}
        whileTap={{ scale: 0.99 }}
        className="bg-card rounded-[var(--radius-card)] border border-border overflow-hidden hover:shadow-lg transition-all"
      >
        {/* Image */}
        <div className="relative h-40 bg-gradient-to-br from-[var(--muted)] to-[var(--surface-elevated)]">
          <ImageWithFallback
            src={clubImages[imageIndex]}
            alt={name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          
          {membershipType && (
            <Badge className={`absolute top-3 right-3 ${
              membershipType === 'Member' 
                ? 'bg-[var(--success)]/90 text-white' 
                : 'bg-[var(--warning)]/90 text-white'
            } border-0`}>
              {membershipType === 'Member' ? (
                <><Check className="w-3 h-3 mr-1" /> Member</>
              ) : (
                <><Clock className="w-3 h-3 mr-1" /> Pending</>
              )}
            </Badge>
          )}

          {/* Distance Badge */}
          <Badge className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white border-0">
            <MapPin className="w-3 h-3 mr-1" />
            {distance}
          </Badge>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-lg line-clamp-1 mb-1">{name}</h3>
            <p className="text-sm text-muted-foreground line-clamp-1">{location}</p>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-[var(--brand-primary)]" />
              {members.toLocaleString()} members
            </div>
          </div>

          {/* Amenities */}
          <div className="flex flex-wrap gap-1.5">
            {amenities.slice(0, 3).map((amenity) => (
              <Badge
                key={amenity}
                variant="secondary"
                className="text-xs px-2 py-0.5"
              >
                {amenity}
              </Badge>
            ))}
          </div>

          {/* Next Event */}
          {nextEvent && (
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4 text-[var(--brand-accent)]" />
                {nextEvent}
              </div>
              <ArrowRight className="w-4 h-4 text-[var(--brand-primary)]" />
            </div>
          )}

          {/* Join Button for non-members */}
          {!membershipType && (
            <Button className="w-full rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)]">
              Join Club
            </Button>
          )}
        </div>
      </motion.div>
    </Link>
  );
}
