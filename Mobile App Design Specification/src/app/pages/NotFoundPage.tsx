import { Home, Search } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../components/ui/button";
import { motion } from "motion/react";

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--brand-primary)]/10 via-background to-[var(--brand-purple)]/10 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center max-w-md"
      >
        <div className="text-8xl font-bold mb-4 bg-gradient-to-r from-[var(--brand-primary)] via-[var(--brand-purple)] to-[var(--brand-accent)] bg-clip-text text-transparent">
          404
        </div>
        <h1 className="text-3xl font-bold mb-3">Page Not Found</h1>
        <p className="text-muted-foreground mb-8">
          Oops! The page you're looking for doesn't exist. It might have been moved or deleted.
        </p>
        <div className="flex gap-3 justify-center">
          <Link to="/">
            <Button className="rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)]">
              <Home className="mr-2 w-4 h-4" />
              Go Home
            </Button>
          </Link>
          <Link to="/tournaments">
            <Button variant="outline" className="rounded-full">
              <Search className="mr-2 w-4 h-4" />
              Browse Tournaments
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
