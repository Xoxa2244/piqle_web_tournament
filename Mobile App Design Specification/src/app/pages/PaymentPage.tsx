import { ArrowLeft, CreditCard, Lock } from "lucide-react";
import { Link, useParams, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Checkbox } from "../components/ui/checkbox";
import { useState } from "react";

export function PaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [saveCard, setSaveCard] = useState(false);

  const handlePayment = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock payment success
    navigate(`/tournaments/${id}`);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border p-4">
        <div className="flex items-center gap-3">
          <Link to={`/tournaments/${id}/register`}>
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] bg-clip-text text-transparent font-bold">Payment</h1>
            <p className="text-sm text-muted-foreground">Secure checkout</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Order Summary */}
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Order Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Spring Championship - 4.0+ Division</span>
              <span>$75.00</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Processing Fee</span>
              <span>$3.00</span>
            </div>
            <div className="border-t border-border pt-2 mt-2">
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span className="text-[var(--brand-primary)]">$78.00</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Payment Form */}
        <form onSubmit={handlePayment} className="space-y-4">
          <Card className="p-4 space-y-4">
            <div>
              <Label htmlFor="cardNumber">Card Number</Label>
              <div className="relative mt-1">
                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="cardNumber"
                  placeholder="1234 5678 9012 3456"
                  className="pl-10 h-12 rounded-xl"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="expiry">Expiry</Label>
                <Input
                  id="expiry"
                  placeholder="MM/YY"
                  className="h-12 rounded-xl mt-1"
                  required
                />
              </div>
              <div>
                <Label htmlFor="cvc">CVC</Label>
                <Input
                  id="cvc"
                  placeholder="123"
                  className="h-12 rounded-xl mt-1"
                  required
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="save-card"
                checked={saveCard}
                onCheckedChange={(checked) => setSaveCard(checked as boolean)}
              />
              <label htmlFor="save-card" className="text-sm cursor-pointer">
                Save card for future payments
              </label>
            </div>
          </Card>

          {/* Security Notice */}
          <Card className="p-4 bg-[var(--muted)]">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-[var(--brand-primary)] mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm mb-1">Secure Payment</h4>
                <p className="text-xs text-muted-foreground">
                  Your payment information is encrypted and secure. We never store your full card details.
                </p>
              </div>
            </div>
          </Card>

          <Button
            type="submit"
            className="w-full h-14 rounded-full text-lg font-semibold bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)]"
          >
            Complete Payment • $78.00
          </Button>
        </form>
      </div>
    </div>
  );
}