import { useState } from "react";
import { Search, MapPin, Plus } from "lucide-react";
import { motion } from "motion/react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ClubCard } from "../components/clubs/ClubCard";
import { ThemeToggleCompact } from "../components/ThemeToggle";

const mockClubs = [
  {
    id: "1",
    name: "Westside Pickleball Club",
    location: "Los Angeles, CA",
    members: 342,
    distance: "2.3 mi",
    image: "sports club facility",
    amenities: ["8 Courts", "Pro Shop", "Lounge"],
    nextEvent: "Tournament • Mar 20",
    membershipType: "Member"
  },
  {
    id: "2",
    name: "Valley Pickleball Association",
    location: "San Fernando Valley, CA",
    members: 215,
    distance: "5.8 mi",
    image: "tennis club outdoor",
    amenities: ["6 Courts", "Parking", "Cafe"],
    nextEvent: "Social Play • Mar 18",
    membershipType: "Pending"
  },
  {
    id: "3",
    name: "Coastal Courts",
    location: "Santa Monica, CA",
    members: 478,
    distance: "8.2 mi",
    image: "beach sports venue",
    amenities: ["10 Courts", "Beach View", "Restaurant"],
    nextEvent: "League Night • Mar 19",
    membershipType: null
  },
  {
    id: "4",
    name: "Downtown Pickleball Hub",
    location: "Los Angeles, CA",
    members: 189,
    distance: "3.5 mi",
    image: "indoor sports facility",
    amenities: ["4 Courts", "Locker Rooms", "Equipment Rental"],
    nextEvent: "Beginner Clinic • Mar 21",
    membershipType: null
  }
];

export function ClubsPage() {
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
              placeholder="Search clubs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-[var(--input-background)] border-0 rounded-full h-11"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-full border-border">
              <MapPin className="w-4 h-4 mr-2" />
              Near Me
            </Button>
            <Button
              size="sm"
              className="rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] ml-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Club
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="discover" className="px-4">
          <TabsList className="w-full">
            <TabsTrigger value="discover" className="flex-1">Discover</TabsTrigger>
            <TabsTrigger value="my-clubs" className="flex-1">My Clubs</TabsTrigger>
            <TabsTrigger value="nearby" className="flex-1">Nearby</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Clubs List */}
      <div className="p-4 space-y-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ staggerChildren: 0.1 }}
        >
          {mockClubs.map((club, index) => (
            <motion.div
              key={club.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <ClubCard {...club} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}