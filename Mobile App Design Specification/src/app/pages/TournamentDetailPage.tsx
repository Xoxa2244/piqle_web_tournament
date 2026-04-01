import { useState } from "react";
import { ArrowLeft, Share2, Heart, MapPin, Calendar, Users, Trophy, DollarSign, Clock } from "lucide-react";
import { Link, useParams } from "react-router";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { motion } from "motion/react";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { Card } from "../components/ui/card";

export function TournamentDetailPage() {
  const { id } = useParams();
  const [isFavorite, setIsFavorite] = useState(false);

  // Mock data
  const tournament = {
    name: "Spring Championship 2026",
    date: "March 15-17, 2026",
    location: "Westside Pickleball Club, Los Angeles, CA",
    players: 124,
    maxPlayers: 128,
    price: 75,
    status: "Open",
    format: "Round Robin + Single Elimination Playoffs",
    image: "https://images.unsplash.com/photo-1696661115319-a9b6801e2571?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZW5uaXMlMjB0b3VybmFtZW50JTIwY2hhbXBpb25zaGlwfGVufDF8fHx8MTc3MjEzNzk0OHww&ixlib=rb-4.1.0&q=80&w=1080",
    divisions: [
      { name: "Open", spots: 12, players: 32, price: 85 },
      { name: "4.0+", spots: 8, players: 32, price: 75 },
      { name: "3.5", spots: 16, players: 32, price: 75 },
      { name: "3.0", spots: 24, players: 32, price: 65 }
    ],
    description: "Join us for the ultimate Spring pickleball tournament featuring top players from across California. Compete in multiple divisions with guaranteed match play and exciting prizes!",
    organizer: {
      name: "LA Pickleball Events",
      tournaments: 42,
      rating: 4.8
    },
    amenities: ["Pro Courts", "Live Streaming", "Food Trucks", "Merchandise", "Parking"],
    prizes: {
      first: 1000,
      second: 500,
      third: 250
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Hero Image */}
      <div className="relative h-64 bg-gradient-to-br from-[var(--muted)] to-[var(--surface-elevated)]">
        <ImageWithFallback
          src={tournament.image}
          alt={tournament.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        
        {/* Header Actions */}
        <div className="absolute top-4 left-0 right-0 flex items-center justify-between px-4">
          <Link to="/tournaments">
            <Button variant="ghost" size="icon" className="rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60"
              onClick={() => setIsFavorite(!isFavorite)}
            >
              <Heart className={`w-5 h-5 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60">
              <Share2 className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Title Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
          <Badge className="bg-[var(--success)]/90 text-white border-0 mb-2">
            {tournament.status}
          </Badge>
          <h1 className="text-2xl mb-1">{tournament.name}</h1>
          <div className="flex items-center gap-2 text-sm text-white/80">
            <Calendar className="w-4 h-4" />
            {tournament.date}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2 p-4 border-b border-border">
        <Card className="p-3 text-center">
          <Users className="w-5 h-5 mx-auto mb-1 text-[var(--brand-primary)]" />
          <div className="text-lg font-bold">{tournament.players}</div>
          <div className="text-xs text-muted-foreground">Players</div>
        </Card>
        <Card className="p-3 text-center">
          <Trophy className="w-5 h-5 mx-auto mb-1 text-[var(--brand-accent)]" />
          <div className="text-lg font-bold">{tournament.divisions.length}</div>
          <div className="text-xs text-muted-foreground">Divisions</div>
        </Card>
        <Card className="p-3 text-center">
          <DollarSign className="w-5 h-5 mx-auto mb-1 text-[var(--brand-secondary)]" />
          <div className="text-lg font-bold">${tournament.price}+</div>
          <div className="text-xs text-muted-foreground">Entry Fee</div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="px-4 pt-4">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="divisions">Divisions</TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Description */}
          <Card className="p-4">
            <h3 className="font-semibold mb-2">About</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {tournament.description}
            </p>
          </Card>

          {/* Format */}
          <Card className="p-4">
            <h3 className="font-semibold mb-2">Format</h3>
            <div className="flex items-center gap-2 text-sm">
              <Trophy className="w-4 h-4 text-[var(--brand-primary)]" />
              {tournament.format}
            </div>
          </Card>

          {/* Location */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Location</h3>
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-[var(--brand-accent)] mt-0.5" />
              <div className="flex-1">
                <p className="text-sm">{tournament.location}</p>
                <Button variant="link" className="px-0 h-auto text-[var(--brand-primary)] text-sm">
                  Open in Maps
                </Button>
              </div>
            </div>
          </Card>

          {/* Amenities */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Amenities</h3>
            <div className="flex flex-wrap gap-2">
              {tournament.amenities.map((amenity) => (
                <Badge key={amenity} variant="secondary">
                  {amenity}
                </Badge>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="divisions" className="space-y-3 mt-4">
          {tournament.divisions.map((division) => (
            <motion.div
              key={division.name}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-lg">{division.name}</h3>
                  <Badge variant={division.spots > 10 ? "default" : "secondary"}>
                    {division.spots} spots left
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    {division.players} max
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <DollarSign className="w-4 h-4" />
                    ${division.price}
                  </div>
                </div>
                <Link to={`/tournaments/${id}/register?division=${division.name}`}>
                  <Button className="w-full rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)]">
                    Register for {division.name}
                  </Button>
                </Link>
              </Card>
            </motion.div>
          ))}
        </TabsContent>

        <TabsContent value="info" className="space-y-4 mt-4">
          {/* Organizer */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Organizer</h3>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-purple)] flex items-center justify-center text-white font-bold">
                LA
              </div>
              <div className="flex-1">
                <div className="font-semibold">{tournament.organizer.name}</div>
                <div className="text-sm text-muted-foreground">
                  {tournament.organizer.tournaments} tournaments • ⭐ {tournament.organizer.rating}
                </div>
              </div>
            </div>
            <Link to="/profile/la-events">
              <Button variant="outline" className="w-full rounded-full">
                View Profile
              </Button>
            </Link>
          </Card>

          {/* Prizes */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Prize Pool</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-3 bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 rounded-lg">
                <span className="font-semibold">🥇 1st Place</span>
                <span className="font-bold text-yellow-600">${tournament.prizes.first}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gradient-to-r from-gray-400/10 to-gray-500/10 rounded-lg">
                <span className="font-semibold">🥈 2nd Place</span>
                <span className="font-bold text-gray-600">${tournament.prizes.second}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gradient-to-r from-orange-600/10 to-orange-700/10 rounded-lg">
                <span className="font-semibold">🥉 3rd Place</span>
                <span className="font-bold text-orange-700">${tournament.prizes.third}</span>
              </div>
            </div>
          </Card>

          {/* Schedule */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Schedule</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-[var(--brand-primary)] mt-0.5" />
                <div>
                  <div className="font-semibold text-sm">Friday, March 15</div>
                  <div className="text-sm text-muted-foreground">Check-in & Practice: 4:00 PM - 6:00 PM</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-[var(--brand-primary)] mt-0.5" />
                <div>
                  <div className="font-semibold text-sm">Saturday, March 16</div>
                  <div className="text-sm text-muted-foreground">Round Robin: 8:00 AM - 5:00 PM</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-[var(--brand-primary)] mt-0.5" />
                <div>
                  <div className="font-semibold text-sm">Sunday, March 17</div>
                  <div className="text-sm text-muted-foreground">Playoffs & Finals: 9:00 AM - 4:00 PM</div>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Fixed Bottom CTA */}
      <div className="fixed bottom-20 left-0 right-0 max-w-md mx-auto p-4 bg-gradient-to-t from-background via-background to-transparent">
        <Link to={`/tournaments/${id}/register`}>
          <Button className="w-full h-14 rounded-full text-lg font-semibold bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] shadow-xl">
            Register Now • ${tournament.price}
          </Button>
        </Link>
      </div>
    </div>
  );
}