import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { api, LeaderboardEntry, PaginatedResponse } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/pagination";
import { Trophy, Medal, Star, Wallet } from "lucide-react";

const RANK_ICONS = [
  <Trophy key={1} className="h-5 w-5 text-amber-500" />,
  <Medal key={2} className="h-5 w-5 text-slate-400" />,
  <Star key={3} className="h-5 w-5 text-amber-700/70" />,
];

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) return RANK_ICONS[rank - 1]!;
  return (
    <span className="w-5 text-center text-sm font-semibold tabular-nums text-muted-foreground">
      {rank}
    </span>
  );
}

function LeaderboardRow({
  entry,
  isCurrentUser,
}: {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
}) {
  const tierBg =
    entry.rank === 1
      ? "bg-amber-500/5 border-amber-500/30"
      : entry.rank === 2
        ? "bg-slate-500/5 border-slate-400/30"
        : entry.rank === 3
          ? "bg-amber-700/5 border-amber-700/20"
          : "border-transparent";

  return (
    <div
      className={`flex items-center gap-4 px-4 py-3 rounded-lg border transition-colors ${tierBg} ${
        isCurrentUser ? "ring-2 ring-primary/30 ring-offset-1" : ""
      }`}
    >
      <div className="w-7 flex justify-center shrink-0">
        <RankBadge rank={entry.rank} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">
          {entry.username}
          {isCurrentUser && (
            <Badge className="ml-2 text-[10px] py-0 px-1.5 bg-primary/15 text-primary border-primary/30">
              You
            </Badge>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-semibold tabular-nums">${entry.balance.toFixed(2)}</span>
      </div>
    </div>
  );
}

function LeaderboardPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [result, setResult] = useState<PaginatedResponse<LeaderboardEntry> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const loadLeaderboard = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getLeaderboard(page);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leaderboard");
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  if (authLoading) return null;

  if (!isAuthenticated) {
    navigate({ to: "/auth/login" });
    return null;
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-background to-muted/20 py-8">
      <div className="max-w-2xl mx-auto px-4 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Trophy className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
            <p className="text-muted-foreground text-sm">Ranked by current balance</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-muted-foreground flex items-center justify-between">
              <span>Top Predictors</span>
              {result && (
                <span className="text-xs font-normal">{result.total.toLocaleString()} users</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 mb-4">
                {error}
              </div>
            )}

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : result && result.data.length > 0 ? (
              <div className="space-y-1">
                {result.data.map((entry) => (
                  <LeaderboardRow
                    key={entry.id}
                    entry={entry}
                    isCurrentUser={user?.id === entry.id}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <Trophy className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No users found.</p>
              </div>
            )}

            <Pagination
              page={result?.page ?? 1}
              totalPages={result?.totalPages ?? 1}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
});
