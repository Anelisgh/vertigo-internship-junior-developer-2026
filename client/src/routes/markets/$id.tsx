import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { api, Market } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useSSE } from "@/hooks/useSSE";
import { formatRelativeTime } from "@/lib/utils";
import {
  ChevronLeft,
  ShieldCheck,
  CheckCircle2,
  Archive,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";

// ─── Bet Distribution Chart ───────────────────────────────────────────────────
function BetChart({ outcomes }: { outcomes: Market["outcomes"] }) {
  const total = outcomes.reduce((sum, o) => sum + o.totalBets, 0);

  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground text-sm">
        No bets placed yet — be the first!
      </div>
    );
  }

  const colors = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-violet-500",
    "bg-cyan-500",
  ];

  return (
    <div className="space-y-3">
      {outcomes.map((outcome, i) => (
        <div key={outcome.id} className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{outcome.title}</span>
            <span className="tabular-nums font-semibold text-primary">{outcome.odds}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${colors[i % colors.length]}`}
              style={{ width: `${outcome.odds}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            ${outcome.totalBets.toFixed(2)} bet
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function AdminPanel({
  market,
  onResolved,
  onArchived,
}: {
  market: Market;
  onResolved: () => void;
  onArchived: () => void;
}) {
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<number | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResolve = async () => {
    if (!selectedOutcomeId) return;
    if (!confirm(`Resolve market with outcome "${market.outcomes.find((o) => o.id === selectedOutcomeId)?.title}"? This will distribute payouts and cannot be undone.`)) return;
    try {
      setIsResolving(true);
      setError(null);
      await api.resolveMarket(market.id, selectedOutcomeId);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve market");
    } finally {
      setIsResolving(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm("Archive this market? All bettors will be fully refunded.")) return;
    try {
      setIsArchiving(true);
      setError(null);
      await api.archiveMarket(market.id);
      onArchived();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive market");
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-amber-600 text-base">
          <ShieldCheck className="h-4 w-4" />
          Admin Controls
        </CardTitle>
        <CardDescription>Resolve this market or archive it and refund all bettors.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-sm font-medium">Winning Outcome</Label>
          <div className="grid gap-2">
            {market.outcomes.map((outcome) => (
              <button
                key={outcome.id}
                onClick={() => setSelectedOutcomeId(outcome.id)}
                className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors text-left ${
                  selectedOutcomeId === outcome.id
                    ? "border-amber-500 bg-amber-500/10 text-amber-700"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                {selectedOutcomeId === outcome.id && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                {outcome.title}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            className="flex-1 gap-2"
            onClick={handleResolve}
            disabled={!selectedOutcomeId || isResolving || isArchiving}
          >
            <CheckCircle2 className="h-4 w-4" />
            {isResolving ? "Resolving…" : "Resolve & Pay Out"}
          </Button>
          <Button
            variant="outline"
            className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={handleArchive}
            disabled={isResolving || isArchiving}
          >
            <Archive className="h-4 w-4" />
            {isArchiving ? "Archiving…" : "Archive & Refund"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function MarketDetailPage() {
  const { id } = useParams({ from: "/markets/$id" });
  const navigate = useNavigate();
  const { isAuthenticated, user, refreshUser } = useAuth();
  const [market, setMarket] = useState<Market | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const [betError, setBetError] = useState<string | null>(null);
  const [isBetting, setIsBetting] = useState(false);
  const [betSuccess, setBetSuccess] = useState(false);

  const marketId = parseInt(id, 10);
  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:4001";

  const loadMarket = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await api.getMarket(marketId);
      setMarket(data);
      if (data.outcomes.length > 0 && !selectedOutcomeId) {
        setSelectedOutcomeId(data.outcomes[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load market");
    } finally {
      setIsLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    loadMarket();
  }, [loadMarket]);

  // SSE live odds
  useSSE<{ type: string; market: Market }>(
    isAuthenticated ? `${apiBase}/api/markets/${marketId}/stream` : null,
    (payload) => {
      if (payload.market) setMarket(payload.market);
    },
  );

  const handlePlaceBet = async () => {
    setBetError(null);
    setBetSuccess(false);
    const amount = parseFloat(betAmount);
    if (!selectedOutcomeId) {
      setBetError("Please select an outcome");
      return;
    }
    if (!betAmount || isNaN(amount) || amount <= 0) {
      setBetError("Bet amount must be a positive number");
      return;
    }
    if (user && amount > user.balance) {
      setBetError("Insufficient balance");
      return;
    }

    try {
      setIsBetting(true);
      await api.placeBet(marketId, selectedOutcomeId, amount);
      setBetAmount("");
      setBetSuccess(true);
      setTimeout(() => setBetSuccess(false), 3000);
      // Refresh balance in context
      await refreshUser();
      // Market odds will update via SSE; force reload as fallback
      await loadMarket();
    } catch (err) {
      setBetError(err instanceof Error ? err.message : "Failed to place bet");
    } finally {
      setIsBetting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <Card className="max-w-sm mx-4">
          <CardContent className="flex flex-col items-center py-12 gap-4">
            <TrendingUp className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-muted-foreground">Please log in to view this market</p>
            <Button onClick={() => navigate({ to: "/auth/login" })}>Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6 animate-pulse">
        <div className="h-8 w-32 bg-muted rounded-lg" />
        <div className="h-56 bg-muted rounded-xl" />
        <div className="h-40 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!market || error) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <Card className="max-w-sm mx-4">
          <CardContent className="flex flex-col items-center py-12 gap-4">
            <p className="text-destructive">{error ?? "Market not found"}</p>
            <Button variant="outline" onClick={() => navigate({ to: "/" })}>
              Back to Markets
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-background to-muted/20 py-8">
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })} className="gap-1 -ml-2">
          <ChevronLeft className="h-4 w-4" />
          Markets
        </Button>

        {/* Market header */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="text-2xl md:text-3xl leading-snug">{market.title}</CardTitle>
                {market.description && (
                  <CardDescription className="mt-2 text-base">{market.description}</CardDescription>
                )}
                <p className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
                  <span>Created by <span className="font-medium text-foreground">{market.creator ?? "Unknown"}</span></span>
                  <span>•</span>
                  <span>{formatRelativeTime(market.createdAt)}</span>
                </p>
              </div>
              <Badge variant={market.status === "active" ? "default" : "secondary"} className="shrink-0">
                {market.status === "active" ? "Active" : "Resolved"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Resolved outcome */}
            {market.status === "resolved" && market.resolvedOutcome && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-emerald-700">Winning Outcome</p>
                  <p className="text-sm text-emerald-600">{market.resolvedOutcome.title}</p>
                </div>
              </div>
            )}

            {/* Bet distribution chart */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Bet Distribution
              </h3>
              <BetChart outcomes={market.outcomes} />
            </div>

            {/* Total pool */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-6 py-4 flex justify-between items-center">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Total Pool</p>
                <p className="text-3xl font-bold text-primary">
                  ${market.totalMarketBets.toFixed(2)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground mb-0.5">Participants</p>
                <p className="text-2xl font-semibold text-muted-foreground">
                  {market.participantsCount ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bet form */}
        {market.status === "active" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Place Your Bet</CardTitle>
              {user && (
                <CardDescription>
                  Balance: <span className="font-semibold text-primary">${user.balance.toFixed(2)}</span>
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Outcome selector */}
              <div className="grid gap-2">
                {market.outcomes.map((outcome) => (
                  <button
                    key={outcome.id}
                    onClick={() => setSelectedOutcomeId(outcome.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      selectedOutcomeId === outcome.id
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:border-primary/40"
                    }`}
                  >
                    <span>{outcome.title}</span>
                    <span className={`tabular-nums font-bold ${selectedOutcomeId === outcome.id ? "text-primary" : "text-muted-foreground"}`}>
                      {outcome.odds}%
                    </span>
                  </button>
                ))}
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <Label htmlFor="betAmount">Amount ($)</Label>
                <Input
                  id="betAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={betAmount}
                  onChange={(e) => {
                    setBetAmount(e.target.value);
                    setBetError(null);
                  }}
                  placeholder="e.g. 50"
                  disabled={isBetting}
                />
                {betError && <p className="text-sm text-destructive">{betError}</p>}
                {betSuccess && (
                  <p className="text-sm text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Bet placed successfully!
                  </p>
                )}
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handlePlaceBet}
                disabled={isBetting || !selectedOutcomeId || !betAmount}
              >
                {isBetting ? "Placing bet…" : "Place Bet"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Admin panel */}
        {user?.isAdmin && market.status === "active" && (
          <AdminPanel
            market={market}
            onResolved={async () => {
              await loadMarket();
              await refreshUser();
            }}
            onArchived={async () => {
              await loadMarket();
              await refreshUser();
            }}
          />
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/markets/$id")({
  component: MarketDetailPage,
});
