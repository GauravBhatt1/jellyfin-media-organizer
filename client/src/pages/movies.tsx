import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Film,
  Trash2,
  Search,
  RefreshCw,
  Grid,
  List,
  Loader2,
  Calendar,
  Folder,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Movie } from "@shared/schema";

export default function Movies() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");

  const { data: movies, isLoading, refetch, isRefetching } = useQuery<Movie[]>({
    queryKey: ["/api/movies"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/movies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Deleted",
        description: "Movie has been removed.",
      });
    },
  });

  const refreshPostersMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/refresh-posters");
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tv-series"] });
      toast({
        title: "Posters Updated",
        description: data.message || "Posters refreshed from TMDB",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to refresh posters. Check TMDB API key in Settings.",
        variant: "destructive",
      });
    },
  });

  const filteredMovies = movies?.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const [failedPosters, setFailedPosters] = useState<Set<string>>(new Set());

  const handlePosterError = useCallback((movieId: string) => {
    setFailedPosters(prev => new Set(prev).add(movieId));
  }, []);

  const MovieCard = ({ movie }: { movie: Movie }) => {
    const showPoster = movie.posterPath && !failedPosters.has(movie.id);
    
    return (
      <Card className="overflow-hidden group" data-testid={`movie-card-${movie.id}`}>
        <div className="aspect-[2/3] bg-muted flex items-center justify-center relative overflow-hidden">
          {showPoster ? (
            <img 
              src={movie.posterPath!} 
              alt={movie.name}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => handlePosterError(movie.id)}
            />
          ) : (
            <Film className="h-12 w-12 text-muted-foreground/30" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteMutation.mutate(movie.id)}
              disabled={deleteMutation.isPending}
              data-testid={`button-delete-movie-${movie.id}`}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Delete
            </Button>
          </div>
        </div>
        <CardContent className="p-3">
          <p className="font-medium text-sm truncate">{movie.name}</p>
          {movie.year && (
            <p className="text-xs text-muted-foreground mt-1">{movie.year}</p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-movies-title">Movies</h1>
          <p className="text-muted-foreground">
            Manage your organized movie library
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => refreshPostersMutation.mutate()}
            disabled={refreshPostersMutation.isPending}
            data-testid="button-refresh-posters"
          >
            {refreshPostersMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Film className="h-4 w-4 mr-2" />
            )}
            {refreshPostersMutation.isPending ? "Fetching..." : "Refresh Posters"}
          </Button>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isRefetching}
            data-testid="button-refresh-movies"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Movies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-movies">
              {movies?.length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              With Year Info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {movies?.filter((m) => m.year).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Year Range
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">
              {movies && movies.length > 0 ? (
                <>
                  {Math.min(...movies.filter((m) => m.year).map((m) => m.year!))} -{" "}
                  {Math.max(...movies.filter((m) => m.year).map((m) => m.year!))}
                </>
              ) : (
                "-"
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Movie Library</CardTitle>
              <CardDescription>
                Browse and manage your movies
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search movies..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-movies"
                />
              </div>
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(value) => value && setViewMode(value as "grid" | "list")}
              >
                <ToggleGroupItem value="list" aria-label="List view" data-testid="button-list-view">
                  <List className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="grid" aria-label="Grid view" data-testid="button-grid-view">
                  <Grid className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
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
          ) : filteredMovies && filteredMovies.length > 0 ? (
            viewMode === "grid" ? (
              <ScrollArea className="h-[500px]">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {filteredMovies.map((movie) => (
                    <MovieCard key={movie.id} movie={movie} />
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-24">Year</TableHead>
                      <TableHead className="w-64">Path</TableHead>
                      <TableHead className="w-16">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMovies.map((movie) => (
                      <TableRow key={movie.id} data-testid={`movie-row-${movie.id}`}>
                        <TableCell>
                          <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-500/10">
                            <Film className="h-4 w-4 text-blue-500" />
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{movie.name}</TableCell>
                        <TableCell>
                          {movie.year ? (
                            <Badge variant="secondary">{movie.year}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[250px]">
                          {movie.filePath || "-"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(movie.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-movie-list-${movie.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <Film className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Movies</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {searchQuery
                  ? "No movies match your search."
                  : "Organize some movies to see them here."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
