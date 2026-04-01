import { ArrowLeft, CheckCircle, Users, Plus, UserPlus } from "lucide-react";
import { Link, useParams, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import { Label } from "../components/ui/label";
import { useState } from "react";
import { Input } from "../components/ui/input";
import { motion, AnimatePresence } from "motion/react";

type Team = {
  id: string;
  name: string;
  players: string[];
  maxPlayers: number;
  skill: string;
};

export function RegistrationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<"division" | "team">("division");
  const [selectedDivision, setSelectedDivision] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<string | "new">("");
  const [newTeamName, setNewTeamName] = useState("");
  const [partnerName, setPartnerName] = useState("");

  const divisions = [
    { id: "open", name: "Open", price: 85, spots: 12, teamSize: 2 },
    { id: "4.0", name: "4.0+", price: 75, spots: 8, teamSize: 2 },
    { id: "3.5", name: "3.5", price: 75, spots: 16, teamSize: 2 },
    { id: "3.0", name: "3.0", price: 65, spots: 24, teamSize: 2 },
  ];

  // Mock teams data - в реальном приложении это будет из API
  const teamsData: Record<string, Team[]> = {
    "open": [
      { id: "t1", name: "Fire Pickles", players: ["Alex Johnson"], maxPlayers: 2, skill: "5.0" },
      { id: "t2", name: "Court Kings", players: ["Sarah Miller"], maxPlayers: 2, skill: "4.8" },
      { id: "t3", name: "Net Ninjas", players: ["Mike Davis"], maxPlayers: 2, skill: "5.2" },
    ],
    "4.0": [
      { id: "t4", name: "Dink Dynasty", players: ["Emma Wilson"], maxPlayers: 2, skill: "4.2" },
      { id: "t5", name: "Paddle Warriors", players: ["John Smith"], maxPlayers: 2, skill: "4.0" },
    ],
    "3.5": [
      { id: "t6", name: "The Picklers", players: ["Lisa Brown"], maxPlayers: 2, skill: "3.7" },
      { id: "t7", name: "Volley Crew", players: ["Tom Anderson"], maxPlayers: 2, skill: "3.5" },
      { id: "t8", name: "Smash Squad", players: ["Rachel Green"], maxPlayers: 2, skill: "3.6" },
    ],
    "3.0": [
      { id: "t9", name: "Ball Busters", players: ["Chris Lee"], maxPlayers: 2, skill: "3.0" },
      { id: "t10", name: "Game Setters", players: ["Nina Patel"], maxPlayers: 2, skill: "3.2" },
    ],
  };

  const currentDivision = divisions.find(d => d.id === selectedDivision);
  const availableTeams = selectedDivision ? (teamsData[selectedDivision] || []) : [];
  const teamsWithSpots = availableTeams.filter(team => team.players.length < team.maxPlayers);

  const handleContinue = () => {
    if (step === "division" && selectedDivision) {
      setStep("team");
    } else if (step === "team" && (selectedTeam || (selectedTeam === "new" && newTeamName && partnerName))) {
      navigate(`/tournaments/${id}/payment`);
    }
  };

  const canProceed = () => {
    if (step === "division") return selectedDivision;
    if (step === "team") {
      if (selectedTeam === "new") {
        return newTeamName.trim() && partnerName.trim();
      }
      return selectedTeam;
    }
    return false;
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border p-4">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => {
              if (step === "team") {
                setStep("division");
                setSelectedTeam("");
                setNewTeamName("");
                setPartnerName("");
              } else {
                navigate(-1);
              }
            }}
            className="rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] bg-clip-text text-transparent font-bold">
              Register
            </h1>
            <p className="text-sm text-muted-foreground">
              {step === "division" ? "Select your division" : "Choose or create a team"}
            </p>
          </div>
          {step === "team" && (
            <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-full">
              <span className="text-xs font-medium">{currentDivision?.name}</span>
              <span className="text-xs text-muted-foreground">${currentDivision?.price}</span>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === "division" && (
          <motion.div
            key="division"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="p-4 space-y-4"
          >
            <RadioGroup value={selectedDivision} onValueChange={setSelectedDivision}>
              {divisions.map((division) => (
                <Card key={division.id} className="p-4 hover:border-[var(--brand-primary)] transition-colors">
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value={division.id} id={division.id} />
                    <Label htmlFor={division.id} className="flex-1 cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-lg">{division.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {division.spots} spots • {teamsData[division.id]?.length || 0} teams
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-[var(--brand-primary)]">${division.price}</div>
                          <Badge variant="secondary" className="mt-1">Open</Badge>
                        </div>
                      </div>
                    </Label>
                  </div>
                </Card>
              ))}
            </RadioGroup>

            {selectedDivision && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="p-4 bg-[var(--success)]/5 border-[var(--success)]/20">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-[var(--success)] mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-semibold mb-1">Division Selected</h4>
                      <p className="text-sm text-muted-foreground">
                        Continue to select your team
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
          </motion.div>
        )}

        {step === "team" && (
          <motion.div
            key="team"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="p-4 space-y-4"
          >
            {/* Create New Team Option */}
            <Card 
              className={`p-4 cursor-pointer transition-all ${
                selectedTeam === "new" ? "border-[var(--brand-primary)] ring-2 ring-[var(--brand-primary)]/20" : "hover:border-[var(--brand-primary)]"
              }`}
              onClick={() => setSelectedTeam("new")}
            >
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-purple)]">
                  <Plus className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">Create New Team</h3>
                  <p className="text-sm text-muted-foreground">Start your own team</p>
                </div>
              </div>

              <AnimatePresence>
                {selectedTeam === "new" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 space-y-3 overflow-hidden"
                  >
                    <div>
                      <Label htmlFor="teamName" className="text-sm font-medium mb-2 block">
                        Team Name
                      </Label>
                      <Input
                        id="teamName"
                        placeholder="Enter team name"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        className="h-12"
                      />
                    </div>
                    <div>
                      <Label htmlFor="partnerName" className="text-sm font-medium mb-2 block">
                        Partner Name (Optional)
                      </Label>
                      <Input
                        id="partnerName"
                        placeholder="Enter partner's name"
                        value={partnerName}
                        onChange={(e) => setPartnerName(e.target.value)}
                        className="h-12"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Leave empty to find a partner later
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>

            {/* Available Teams */}
            {teamsWithSpots.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <div className="h-px bg-border flex-1" />
                  <span className="text-sm text-muted-foreground font-medium">
                    Join Existing Team
                  </span>
                  <div className="h-px bg-border flex-1" />
                </div>

                <RadioGroup value={selectedTeam === "new" ? "" : selectedTeam} onValueChange={setSelectedTeam}>
                  {teamsWithSpots.map((team) => (
                    <Card 
                      key={team.id} 
                      className={`p-4 cursor-pointer transition-all ${
                        selectedTeam === team.id ? "border-[var(--brand-primary)] ring-2 ring-[var(--brand-primary)]/20" : "hover:border-[var(--brand-primary)]"
                      }`}
                      onClick={() => setSelectedTeam(team.id)}
                    >
                      <div className="flex items-center gap-3">
                        <RadioGroupItem value={team.id} id={team.id} />
                        <Label htmlFor={team.id} className="flex-1 cursor-pointer">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-lg">{team.name}</h3>
                                <Badge variant="outline" className="text-xs">
                                  {team.skill}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Users className="w-4 h-4" />
                                <span>{team.players[0]}</span>
                                <span className="text-xs">+ You</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <Badge className="bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20">
                                <UserPlus className="w-3 h-3 mr-1" />
                                1 spot open
                              </Badge>
                            </div>
                          </div>
                        </Label>
                      </div>
                    </Card>
                  ))}
                </RadioGroup>
              </>
            )}

            {teamsWithSpots.length === 0 && selectedTeam !== "new" && (
              <Card className="p-6 bg-muted/50 border-dashed">
                <div className="text-center">
                  <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <h3 className="font-semibold mb-1">No Teams Available</h3>
                  <p className="text-sm text-muted-foreground">
                    Create a new team to get started
                  </p>
                </div>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-20 left-0 right-0 max-w-md mx-auto p-4 bg-gradient-to-t from-background via-background to-transparent">
        <Button
          disabled={!canProceed()}
          onClick={handleContinue}
          className="w-full h-14 rounded-full text-lg font-semibold bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] disabled:opacity-50"
        >
          {step === "division" ? "Continue" : "Continue to Payment"}
        </Button>
      </div>
    </div>
  );
}