import { Camera, Settings, TrendingUp, Trophy, Users, Calendar, ExternalLink, Target, ArrowLeft, MessageCircle, UserPlus } from "lucide-react";
import { motion } from "motion/react";
import { useNavigate, useParams, Link } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Progress } from "../components/ui/progress";

export function ProfilePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isOwnProfile = !id; // If no id in URL, it's own profile
  
  // Mock data for own profile
  const ownUser = {
    id: "current-user",
    name: "Alex Morgan",
    username: "@alexm",
    location: "Los Angeles, CA",
    memberSince: "January 2024",
    duprRating: 4.23,
    duprTrend: "+0.15",
    avatar: "AM",
    stats: {
      tournaments: 12,
      wins: 34,
      winRate: 67,
      clubs: 5
    },
    achievements: [
      { name: "First Tournament", icon: "🏆", date: "Feb 2024" },
      { name: "5 Wins Streak", icon: "🔥", date: "Mar 2024" },
      { name: "Club Captain", icon: "⭐", date: "Mar 2024" }
    ],
    recentTournaments: [
      { name: "Winter Classic", division: "4.0+", place: "1st", date: "Feb 15" },
      { name: "Valley Open", division: "4.0", place: "3rd", date: "Feb 28" },
      { name: "Coastal Championship", division: "4.0+", place: "2nd", date: "Mar 5" }
    ]
  };

  // Mock data for other user profiles
  const otherUser = {
    id: id || "la-events",
    name: "LA Pickleball Events",
    username: "@la_events",
    location: "Los Angeles, CA",
    memberSince: "March 2022",
    duprRating: 4.85,
    duprTrend: "+0.08",
    avatar: "LA",
    stats: {
      tournaments: 42,
      wins: 156,
      winRate: 73,
      clubs: 3
    },
    achievements: [
      { name: "Tournament Organizer", icon: "🎯", date: "Mar 2022" },
      { name: "Top Rated Organizer", icon: "⭐", date: "Jun 2023" },
      { name: "50+ Events", icon: "🏆", date: "Jan 2024" }
    ],
    recentTournaments: [
      { name: "Spring Championship 2026", division: "Open", place: "Organizer", date: "Mar 15" },
      { name: "Winter Showdown", division: "All", place: "Organizer", date: "Feb 22" },
      { name: "Valley Classic", division: "4.0+", place: "Organizer", date: "Jan 18" }
    ]
  };

  const user = isOwnProfile ? ownUser : otherUser;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-[var(--surface-elevated)] pb-20">
      {/* Back button for other profiles */}
      {!isOwnProfile && (
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border">
          <div className="flex items-center justify-between px-4 h-14">
            <Link to={-1 as any}>
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h2 className="font-semibold">Profile</h2>
            <div className="w-10" /> {/* Spacer for centering */}
          </div>
        </div>
      )}

      {/* Header Card */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-start gap-4 mb-4">
          {/* Avatar */}
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[var(--brand-secondary)] to-[var(--brand-primary)] flex items-center justify-center text-white text-2xl font-bold shadow-lg">
              {user.avatar}
            </div>
            {isOwnProfile && (
              <button className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[var(--brand-primary)] flex items-center justify-center text-white shadow-md">
                <Camera className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex-1 flex flex-col gap-2 pt-2">
            {isOwnProfile ? (
              <>
                <Button 
                  variant="outline" 
                  className="w-full rounded-full"
                  onClick={() => navigate("/profile/edit")}
                >
                  Edit Profile
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full rounded-full"
                  onClick={() => navigate("/profile/settings")}
                >
                  <Settings className="w-5 h-5 mr-2" />
                  Settings
                </Button>
              </>
            ) : (
              <>
                <Button 
                  className="w-full rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)]"
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Message
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full rounded-full"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Follow
                </Button>
              </>
            )}
          </div>
        </div>

        {/* User Info */}
        <div className="mb-4">
          <h1 className="text-2xl mb-1">{user.name}</h1>
          <p className="text-muted-foreground">{user.username}</p>
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
            <span>📍 {user.location}</span>
            <span>•</span>
            <span>Member since {user.memberSince}</span>
          </div>
        </div>

        {/* DUPR Rating Card */}
        <Card className="p-4 mb-4 bg-gradient-to-br from-[var(--brand-primary)]/5 to-[var(--brand-purple)]/5 border-[var(--brand-primary)]/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-purple)] flex items-center justify-center text-white">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">DUPR Rating</div>
                <div className="text-2xl font-bold">{user.duprRating}</div>
              </div>
            </div>
            <Badge className="bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20">
              {user.duprTrend} this month
            </Badge>
          </div>
          <Button variant="outline" size="sm" className="w-full rounded-full">
            <ExternalLink className="w-4 h-4 mr-2" />
            View on DUPR
          </Button>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <Card className="p-3 text-center">
            <Trophy className="w-5 h-5 mx-auto mb-1 text-[var(--brand-accent)]" />
            <div className="text-lg font-bold">{user.stats.tournaments}</div>
            <div className="text-xs text-muted-foreground">Events</div>
          </Card>
          <Card className="p-3 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-1 text-[var(--brand-primary)]" />
            <div className="text-lg font-bold">{user.stats.wins}</div>
            <div className="text-xs text-muted-foreground">Wins</div>
          </Card>
          <Card className="p-3 text-center">
            <Target className="w-5 h-5 mx-auto mb-1 text-[var(--brand-purple)]" />
            <div className="text-lg font-bold">{user.stats.winRate}%</div>
            <div className="text-xs text-muted-foreground">Win Rate</div>
          </Card>
          <Card className="p-3 text-center">
            <Users className="w-5 h-5 mx-auto mb-1 text-[var(--brand-secondary)]" />
            <div className="text-lg font-bold">{user.stats.clubs}</div>
            <div className="text-xs text-muted-foreground">Clubs</div>
          </Card>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="activity" className="px-4">
        <TabsList className="w-full">
          <TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger>
          <TabsTrigger value="achievements" className="flex-1">Achievements</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="space-y-3 mt-4">
          <h3 className="font-semibold">Recent Tournaments</h3>
          {user.recentTournaments.map((tournament, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold">{tournament.name}</h4>
                    <p className="text-sm text-muted-foreground">{tournament.division}</p>
                  </div>
                  <Badge className={
                    tournament.place === "1st" 
                      ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
                      : tournament.place === "2nd"
                      ? "bg-gray-400/10 text-gray-600 border-gray-400/20"
                      : "bg-orange-600/10 text-orange-700 border-orange-600/20"
                  }>
                    {tournament.place === "1st" && "🥇"} 
                    {tournament.place === "2nd" && "🥈"}
                    {tournament.place === "3rd" && "🥉"}
                    {" "}{tournament.place}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  {tournament.date}
                </div>
              </Card>
            </motion.div>
          ))}
        </TabsContent>

        <TabsContent value="achievements" className="space-y-3 mt-4">
          <h3 className="font-semibold">Unlocked Achievements</h3>
          {user.achievements.map((achievement, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--brand-primary)]/10 to-[var(--brand-purple)]/10 flex items-center justify-center text-2xl">
                    {achievement.icon}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">{achievement.name}</h4>
                    <p className="text-sm text-muted-foreground">Earned {achievement.date}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}