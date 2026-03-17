import { ArrowLeft, MapPin, Users, Calendar, Share2, Bell, Crown, Shield, UserX, Ban, Check, X, Search, MoreVertical } from "lucide-react";
import { Link, useParams } from "react-router";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { useState } from "react";
import { Input } from "../components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { motion, AnimatePresence } from "motion/react";

type Member = {
  id: string;
  name: string;
  avatar: string;
  role: "owner" | "admin" | "member";
  skill: string;
  joinedDate: string;
  status: "active" | "banned";
};

type PendingRequest = {
  id: string;
  name: string;
  avatar: string;
  skill: string;
  requestDate: string;
  message?: string;
};

export function ClubDetailPage() {
  const { id } = useParams();
  const [isAdmin] = useState(true); // Mock: в реальности из контекста пользователя
  const [searchQuery, setSearchQuery] = useState("");
  const [members, setMembers] = useState<Member[]>([
    { id: "1", name: "Sarah Johnson", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150", role: "owner", skill: "4.5", joinedDate: "Jan 2024", status: "active" },
    { id: "2", name: "Mike Chen", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150", role: "admin", skill: "4.2", joinedDate: "Feb 2024", status: "active" },
    { id: "3", name: "Emily Davis", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150", role: "member", skill: "3.8", joinedDate: "Mar 2024", status: "active" },
    { id: "4", name: "Alex Rodriguez", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150", role: "member", skill: "4.0", joinedDate: "Mar 2024", status: "active" },
    { id: "5", name: "Jessica Lee", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150", role: "member", skill: "3.5", joinedDate: "Mar 2024", status: "active" },
    { id: "6", name: "Tom Wilson", avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150", role: "member", skill: "4.1", joinedDate: "Mar 2024", status: "active" },
  ]);

  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([
    { id: "p1", name: "Rachel Green", avatar: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=150", skill: "3.7", requestDate: "2 days ago", message: "Hi! I'd love to join your club. I play regularly and looking for a community." },
    { id: "p2", name: "David Kim", avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150", skill: "4.0", requestDate: "5 days ago" },
  ]);

  const filteredMembers = members.filter(member => 
    member.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    member.status === "active"
  );

  const handleKickMember = (memberId: string) => {
    setMembers(members.filter(m => m.id !== memberId));
  };

  const handleBanMember = (memberId: string) => {
    setMembers(members.map(m => 
      m.id === memberId ? { ...m, status: "banned" as const } : m
    ));
  };

  const handleApproveRequest = (requestId: string) => {
    const request = pendingRequests.find(r => r.id === requestId);
    if (request) {
      setMembers([...members, {
        id: `m_${Date.now()}`,
        name: request.name,
        avatar: request.avatar,
        role: "member",
        skill: request.skill,
        joinedDate: "Just now",
        status: "active"
      }]);
      setPendingRequests(pendingRequests.filter(r => r.id !== requestId));
    }
  };

  const handleRejectRequest = (requestId: string) => {
    setPendingRequests(pendingRequests.filter(r => r.id !== requestId));
  };

  const getRoleIcon = (role: Member["role"]) => {
    switch (role) {
      case "owner": return <Crown className="w-4 h-4 text-yellow-500" />;
      case "admin": return <Shield className="w-4 h-4 text-blue-500" />;
      default: return null;
    }
  };

  const getRoleColor = (role: Member["role"]) => {
    switch (role) {
      case "owner": return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
      case "admin": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="relative h-56 bg-gradient-to-br from-[var(--muted)] to-[var(--surface-elevated)]">
        <ImageWithFallback
          src="https://images.unsplash.com/photo-1761775446030-5e1fdd4166a5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzcG9ydHMlMjBjbHViJTIwZmFjaWxpdHl8ZW58MXx8fHwxNzcyMTM4MTAyfDA&ixlib=rb-4.1.0&q=80&w=1080"
          alt="Club"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        
        <div className="absolute top-4 left-0 right-0 flex items-center justify-between px-4">
          <Link to="/clubs">
            <Button variant="ghost" size="icon" className="rounded-full bg-black/40 backdrop-blur-sm text-white">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" className="rounded-full bg-black/40 backdrop-blur-sm text-white">
              <Bell className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full bg-black/40 backdrop-blur-sm text-white">
              <Share2 className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
          <h1 className="text-2xl mb-2">Westside Pickleball Club</h1>
          <div className="flex items-center gap-3 text-sm text-white/80">
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              Los Angeles, CA
            </div>
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              342 members
            </div>
          </div>
        </div>
      </div>

      <div className="p-4">
        <Tabs defaultValue="feed" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="feed">Feed</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="space-y-3 mt-4">
            <Card className="p-4">
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                <h3 className="font-semibold mb-2">Welcome to the Club!</h3>
                <p className="text-sm text-muted-foreground mb-4">Stay updated with announcements and events</p>
                <Button className="rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)]">
                  Join Club Chat
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="events" className="space-y-3 mt-4">
            <Card className="p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-purple)] flex items-center justify-center text-white font-bold">
                  20
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold">Tournament Night</h4>
                  <p className="text-sm text-muted-foreground">March 20, 2026 • 6:00 PM</p>
                </div>
                <Badge variant="secondary">Upcoming</Badge>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="members" className="mt-4 space-y-4">
            {/* Pending Requests Section (Admin only) */}
            {isAdmin && pendingRequests.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-lg">Pending Requests</h3>
                  <Badge variant="secondary" className="bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                    {pendingRequests.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <AnimatePresence>
                    {pendingRequests.map((request) => (
                      <motion.div
                        key={request.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <Card className="p-4">
                          <div className="flex items-start gap-3">
                            <ImageWithFallback
                              src={request.avatar}
                              alt={request.name}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold">{request.name}</h4>
                                <Badge variant="outline" className="text-xs">
                                  {request.skill}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mb-1">{request.requestDate}</p>
                              {request.message && (
                                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                  {request.message}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <Button
                              onClick={() => handleApproveRequest(request.id)}
                              className="flex-1 h-10 rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)]"
                            >
                              <Check className="w-4 h-4 mr-2" />
                              Approve
                            </Button>
                            <Button
                              onClick={() => handleRejectRequest(request.id)}
                              variant="outline"
                              className="flex-1 h-10 rounded-full border-destructive/20 text-destructive hover:bg-destructive/10"
                            >
                              <X className="w-4 h-4 mr-2" />
                              Reject
                            </Button>
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 rounded-full"
              />
            </div>

            {/* Members List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-lg">Members</h3>
                <span className="text-sm text-muted-foreground">{filteredMembers.length} total</span>
              </div>
              
              <div className="space-y-2">
                {filteredMembers.map((member) => (
                  <Card key={member.id} className="p-3 hover:border-[var(--brand-primary)] transition-colors">
                    <div className="flex items-center gap-3">
                      <Link to={`/profile/${member.id}`} className="flex-shrink-0">
                        <ImageWithFallback
                          src={member.avatar}
                          alt={member.name}
                          className="w-12 h-12 rounded-full object-cover ring-2 ring-border"
                        />
                      </Link>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Link to={`/profile/${member.id}`}>
                            <h4 className="font-semibold hover:text-[var(--brand-primary)] transition-colors">
                              {member.name}
                            </h4>
                          </Link>
                          {member.role !== "member" && (
                            <Badge variant="outline" className={getRoleColor(member.role)}>
                              <span className="mr-1">{getRoleIcon(member.role)}</span>
                              {member.role}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span className="font-medium text-foreground">{member.skill}</span> skill
                          </span>
                          <span>•</span>
                          <span>Joined {member.joinedDate}</span>
                        </div>
                      </div>

                      {/* Admin Controls */}
                      {isAdmin && member.role !== "owner" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full"
                            >
                              <MoreVertical className="w-5 h-5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onClick={() => handleKickMember(member.id)}
                              className="text-orange-600 focus:text-orange-600"
                            >
                              <UserX className="w-4 h-4 mr-2" />
                              Kick Member
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleBanMember(member.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Ban className="w-4 h-4 mr-2" />
                              Ban Member
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </Card>
                ))}
              </div>

              {filteredMembers.length === 0 && (
                <Card className="p-8 bg-muted/50 border-dashed">
                  <div className="text-center">
                    <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <h3 className="font-semibold mb-1">No members found</h3>
                    <p className="text-sm text-muted-foreground">
                      Try adjusting your search query
                    </p>
                  </div>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}