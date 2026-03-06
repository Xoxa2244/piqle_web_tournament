import { ArrowLeft, CheckCircle } from "lucide-react";
import { Link, useParams, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import { Label } from "../components/ui/label";
import { useState } from "react";

export function RegistrationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [selectedDivision, setSelectedDivision] = useState("");

  const divisions = [
    { id: "open", name: "Open", price: 85, spots: 12 },
    { id: "4.0", name: "4.0+", price: 75, spots: 8 },
    { id: "3.5", name: "3.5", price: 75, spots: 16 },
    { id: "3.0", name: "3.0", price: 65, spots: 24 },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border p-4">
        <div className="flex items-center gap-3">
          <Link to={`/tournaments/${id}`}>
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] bg-clip-text text-transparent font-bold">Register</h1>
            <p className="text-sm text-muted-foreground">Select your division</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <RadioGroup value={selectedDivision} onValueChange={setSelectedDivision}>
          {divisions.map((division) => (
            <Card key={division.id} className="p-4">
              <div className="flex items-center space-x-3">
                <RadioGroupItem value={division.id} id={division.id} />
                <Label htmlFor={division.id} className="flex-1 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-lg">{division.name}</div>
                      <div className="text-sm text-muted-foreground">{division.spots} spots available</div>
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
          <Card className="p-4 bg-[var(--success)]/5 border-[var(--success)]/20">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-[var(--success)] mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold mb-1">Division Selected</h4>
                <p className="text-sm text-muted-foreground">Click continue to proceed to payment</p>
              </div>
            </div>
          </Card>
        )}
      </div>

      <div className="fixed bottom-20 left-0 right-0 max-w-md mx-auto p-4 bg-gradient-to-t from-background via-background to-transparent">
        <Link to={`/tournaments/${id}/payment`}>
          <Button
            disabled={!selectedDivision}
            className="w-full h-14 rounded-full text-lg font-semibold bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] disabled:opacity-50"
          >
            Continue to Payment
          </Button>
        </Link>
      </div>
    </div>
  );
}