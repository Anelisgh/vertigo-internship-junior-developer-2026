import { Market } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "@tanstack/react-router";
import { formatRelativeTime } from "@/lib/utils";

interface MarketCardProps {
  market: Market;
}

export function MarketCard({ market }: MarketCardProps) {
  const navigate = useNavigate();

  return (
    <Card className="transition-all hover:shadow-md hover:-translate-y-1 hover:border-primary/30 flex flex-col h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-xl leading-snug">{market.title}</CardTitle>
            <CardDescription className="mt-1.5 flex items-center gap-1.5 text-xs">
              <span className="font-medium">{market.creator || "Unknown"}</span>
              <span>•</span>
              <span>{formatRelativeTime(market.createdAt)}</span>
            </CardDescription>
          </div>
          <Badge variant={market.status === "active" ? "default" : "secondary"} className="shrink-0 mt-0.5">
            {market.status === "active" ? "Active" : "Resolved"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 flex flex-col justify-end">
        {/* Outcomes */}
        <div className="space-y-2">
          {market.outcomes.map((outcome) => (
            <div
              key={outcome.id}
              className="flex items-center justify-between bg-secondary/20 p-3 rounded-md"
            >
              <div>
                <p className="text-sm font-medium">{outcome.title}</p>
                <p className="text-xs text-muted-foreground">
                  ${outcome.totalBets.toFixed(2)} total
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">{outcome.odds}%</p>
              </div>
            </div>
          ))}
        </div>

        {/* Total Market Value & Participants */}
        <div className="p-3 rounded-md border border-primary/20 bg-primary/5 flex justify-between items-center">
          <div>
            <p className="text-xs text-muted-foreground">Total Value</p>
            <p className="text-2xl font-bold text-primary">${market.totalMarketBets.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Participants</p>
            <p className="text-xl font-semibold text-muted-foreground">{market.participantsCount ?? 0}</p>
          </div>
        </div>

        {/* Action Button */}
        <Button className="w-full" onClick={() => navigate({ to: `/markets/${market.id}` })}>
          {market.status === "active" ? "Place Bet" : "View Results"}
        </Button>
      </CardContent>
    </Card>
  );
}
