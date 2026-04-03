import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Wallet, Trophy, User, LogOut, ShieldCheck } from "lucide-react";

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate({ to: "/auth/login" });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <TrendingUp className="h-5 w-5 text-primary" />
          <span>PredictIt</span>
        </Link>

        {isAuthenticated && user ? (
          <div className="flex items-center gap-2">
            {/* Balance */}
            <Badge
              variant="outline"
              className="gap-1.5 py-1 px-2.5 font-semibold text-sm border-primary/30 text-primary"
            >
              <Wallet className="h-3.5 w-3.5" />
              ${user.balance.toFixed(2)}
            </Badge>

            {/* Admin badge */}
            {user.isAdmin && (
              <Badge className="gap-1 bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/20">
                <ShieldCheck className="h-3 w-3" />
                Admin
              </Badge>
            )}

            {/* Nav links */}
            <nav className="hidden sm:flex items-center gap-1 ml-2">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/leaderboard" className="gap-1.5">
                  <Trophy className="h-4 w-4" />
                  Leaderboard
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/profile" className="gap-1.5">
                  <User className="h-4 w-4" />
                  Profile
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="gap-1.5 text-muted-foreground"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </nav>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/auth/login" })}>
              Login
            </Button>
            <Button size="sm" onClick={() => navigate({ to: "/auth/register" })}>
              Sign Up
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
