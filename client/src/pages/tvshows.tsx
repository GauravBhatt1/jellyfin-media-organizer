import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Tv,
  ChevronDown,
  ChevronRight,
  Folder,
  FileVideo,
  Plus,
  Trash2,
  Edit,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { TvSeries } from "@shared/schema";

interface SeriesWithEpisodes extends TvSeries {
  seasons: Array<{
    number: number;
    episodes: Array<{
      id: string;
      episode: number;
      filename: string;
    }>;
  }>;
}

export default function TvShows() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set());
  const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set());
  const [failedPosters, setFailedPosters] = useState<Set<string>>(new Set());

  const handlePosterError = useCallback((seriesId: string) => {
    setFailedPosters(prev => new Set(prev).add(seriesId));
  }, []);

  const { data: series, isLoading, refetch, isRefetching } = useQuery<SeriesWithEpisodes[]>({
    queryKey: ["/api/tv-series"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/tv-series/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tv-series"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Deleted",
        description: "TV series has been removed.",
      });
    },
  });

  const toggleSeries = (seriesId: string) => {
    const newSet = new Set(expandedSeries);
    if (newSet.has(seriesId)) {
      newSet.delete(seriesId);
    } else {
      newSet.add(seriesId);
    }
    setExpandedSeries(newSet);
  };

  const toggleSeason = (seasonKey: string) => {
    const newSet = new Set(expandedSeasons);
    if (newSet.has(seasonKey)) {
      newSet.delete(seasonKey);
    } else {
      newSet.add(seasonKey);
    }
    setExpandedSeasons(newSet);
  };

  const filteredSeries = series?.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalEpisodes = series?.reduce(
    (acc, s) => acc + s.seasons.reduce((sAcc, season) => sAcc + season.episodes.length, 0),
    0
  ) || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-tvshows-title">TV Shows</h1>
          <p className="text-muted-foreground">
            Manage your organized TV series library
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isRefetching}
          data-testid="button-refresh-tvshows"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Series
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-series">
              {series?.length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Episodes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-episodes">
              {totalEpisodes}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average per Series
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {series && series.length > 0 ? Math.round(totalEpisodes / series.length) : 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Series Library</CardTitle>
              <CardDescription>
                Browse and manage your TV shows
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search series..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-series"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredSeries && filteredSeries.length > 0 ? (
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {filteredSeries.map((show) => (
                  <Collapsible
                    key={show.id}
                    open={expandedSeries.has(show.id)}
                    onOpenChange={() => toggleSeries(show.id)}
                  >
                    <div
                      className="border rounded-lg overflow-hidden"
                      data-testid={`series-${show.id}`}
                    >
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between gap-4 p-4 cursor-pointer hover-elevate">
                          <div className="flex items-center gap-3">
                            {show.posterPath && !failedPosters.has(show.id) ? (
                              <div className="h-14 w-10 rounded-md overflow-hidden bg-muted flex-shrink-0">
                                <img 
                                  src={show.posterPath} 
                                  alt={show.name}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  onError={() => handlePosterError(show.id)}
                                />
                              </div>
                            ) : (
                              <div className="flex h-14 w-10 items-center justify-center rounded-md bg-purple-500/10">
                                <Tv className="h-5 w-5 text-purple-500" />
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{show.name}</p>
                                {show.year && (
                                  <Badge variant="secondary" className="text-xs">
                                    {show.year}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {show.seasons.length} season{show.seasons.length !== 1 ? "s" : ""} •{" "}
                                {show.seasons.reduce((acc, s) => acc + s.episodes.length, 0)} episodes
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteMutation.mutate(show.id);
                              }}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-series-${show.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                            {expandedSeries.has(show.id) ? (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="px-4 pb-4 space-y-2">
                          {show.seasons.map((season) => {
                            const seasonKey = `${show.id}-${season.number}`;
                            return (
                              <Collapsible
                                key={seasonKey}
                                open={expandedSeasons.has(seasonKey)}
                                onOpenChange={() => toggleSeason(seasonKey)}
                              >
                                <CollapsibleTrigger asChild>
                                  <div className="flex items-center justify-between gap-2 p-3 rounded-md bg-muted/50 cursor-pointer hover-elevate">
                                    <div className="flex items-center gap-2">
                                      <Folder className="h-4 w-4 text-muted-foreground" />
                                      <span className="text-sm font-medium">
                                        Season {String(season.number).padStart(2, "0")}
                                      </span>
                                      <Badge variant="outline" className="text-xs">
                                        {season.episodes.length} episodes
                                      </Badge>
                                    </div>
                                    {expandedSeasons.has(seasonKey) ? (
                                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </div>
                                </CollapsibleTrigger>

                                <CollapsibleContent>
                                  <div className="ml-6 mt-2 space-y-1">
                                    {season.episodes.map((ep) => (
                                      <div
                                        key={ep.id}
                                        className="flex items-center gap-2 p-2 rounded text-sm"
                                        data-testid={`episode-${ep.id}`}
                                      >
                                        <FileVideo className="h-3 w-3 text-muted-foreground" />
                                        <span className="font-mono text-xs text-muted-foreground">
                                          E{String(ep.episode).padStart(2, "0")}
                                        </span>
                                        <span className="truncate text-muted-foreground">
                                          {ep.filename}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <Tv className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No TV Shows</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {searchQuery
                  ? "No series match your search."
                  : "Organize some TV shows to see them here."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
