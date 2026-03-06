import { useState } from "react";
import { Filter, MapPin, Search, Calendar } from "lucide-react";
import { motion } from "motion/react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { TournamentCard } from "../components/tournaments/TournamentCard";
import { FilterSheet } from "../components/tournaments/FilterSheet";
import { ThemeToggleCompact } from "../components/ThemeToggle";

const mockTournaments = [
  {
    id: "1",
    name: "Spring Championship 2026",
    date: "Mar 15-17",
    location: "Los Angeles, CA",
    players: 124,
    maxPlayers: 128,
    price: 75,
    status: "Open" as const,
    format: "Round Robin + Playoffs",
    divisions: ["Open", "4.0+", "3.5", "3.0"]
  },
  {
    id: "2",
    name: "Coastal Classic",
    date: "Mar 22-24",
    location: "San Diego, CA",
    players: 96,
    maxPlayers: 96,
    price: 85,
    status: "Filling Fast" as const,
    format: "Double Elimination",
    divisions: ["Open", "4.5+", "4.0"]
  },
  {
    id: "3",
    name: "Valley Invitational",
    date: "Apr 5-7",
    location: "Phoenix, AZ",
    players: 58,
    maxPlayers: 64,
    price: 65,
    status: "Open" as const,
    format: "Indy League",
    divisions: ["Mixed Doubles", "Men's", "Women's"]
  },
  {
    id: "4",
    name: "Desert Showdown",
    date: "Apr 12-14",
    location: "Las Vegas, NV",
    players: 112,
    maxPlayers: 128,
    price: 95,
    status: "Waitlist" as const,
    format: "Ladder + Finals",
    divisions: ["Pro", "Advanced", "Intermediate"]
  },
];

export function TournamentsPage() {
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Theme Toggle - Fixed position */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggleCompact />
      </div>

      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border pt-4">
        <div className="px-4 pb-4">
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search tournaments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-[var(--input-background)] border-0 rounded-full h-11"
            />
          </div>
          
          {/* Quick Filters */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(true)}
              className="rounded-full border-border flex-shrink-0"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
            <Button variant="outline" size="sm" className="rounded-full border-border flex-shrink-0">
              <MapPin className="w-4 h-4 mr-2" />
              Near Me
            </Button>
            <Button variant="outline" size="sm" className="rounded-full border-border flex-shrink-0">
              <Calendar className="w-4 h-4 mr-2" />
              This Month
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="upcoming" className="px-4">
          <TabsList className="w-full">
            <TabsTrigger value="upcoming" className="flex-1">Upcoming</TabsTrigger>
            <TabsTrigger value="registered" className="flex-1">Registered</TabsTrigger>
            <TabsTrigger value="past" className="flex-1">Past</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tournament List */}
      <div className="p-4 space-y-4 mt-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ staggerChildren: 0.1 }}
        >
          {mockTournaments.map((tournament, index) => (
            <motion.div
              key={tournament.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <TournamentCard {...tournament} />
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Filter Sheet */}
      <FilterSheet open={showFilters} onClose={() => setShowFilters(false)} />
    </div>
  );
}