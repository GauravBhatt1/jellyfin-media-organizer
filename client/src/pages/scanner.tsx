import { useQuery, useMutation } from "@tanstack/react-query";
import {
  FolderSearch,
  FileVideo,
  Film,
  Tv,
  AlertCircle,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Loader2,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { MediaItem } from "@shared/schema";

export default function Scanner() {
  const { toast } = useToast();

  const { data: items, isLoading } = useQuery<MediaItem[]>({
    queryKey: ["/api/media-items"],
  });

  const scanFolderMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/scan-folder", {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/media-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Library Scan Complete",
        description: `Found ${data.scanned} video files, ${data.newItems} new items added.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Scan Failed",
        description: error.message || "Could not scan the source folder.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/media-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Deleted",
        description: "Item has been removed.",
      });
    },
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "movie":
        return <Film className="h-4 w-4 text-blue-500" />;
      case "tvshow":
        return <Tv className="h-4 w-4 text-purple-500" />;
      default:
        return <FileVideo className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
      organized: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
      conflict: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
      duplicate: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    };
    return (
      <Badge variant="outline" className={variants[status as keyof typeof variants]}>
        {status}
      </Badge>
    );
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return "text-green-500";
    if (confidence >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-scanner-title">File Scanner</h1>
          <p className="text-muted-foreground">
            Scan and detect media files from your source folder
          </p>
        </div>
        <Button 
          onClick={() => scanFolderMutation.mutate()}
          disabled={scanFolderMutation.isPending}
          data-testid="button-scan-library"
        >
          {scanFolderMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <FolderSearch className="h-4 w-4 mr-2" />
              Scan Library
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Scanned Files</CardTitle>
            <CardDescription>
              {items?.length || 0} files detected
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/media-items"] })}
            data-testid="button-refresh-list"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : items && items.length > 0 ? (
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Type</TableHead>
                    <TableHead>Original Filename</TableHead>
                    <TableHead>Detected Name</TableHead>
                    <TableHead className="w-24">Season/Ep</TableHead>
                    <TableHead className="w-20">Year</TableHead>
                    <TableHead className="w-24">Confidence</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger>
                            {getTypeIcon(item.detectedType || "unknown")}
                          </TooltipTrigger>
                          <TooltipContent>
                            {item.detectedType === "movie"
                              ? "Movie"
                              : item.detectedType === "tvshow"
                              ? "TV Show"
                              : "Unknown"}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">
                        <Tooltip>
                          <TooltipTrigger className="cursor-default">
                            {item.originalFilename}
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[400px]">
                            {item.originalFilename}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="font-medium">
                        {item.detectedName || "-"}
                      </TableCell>
                      <TableCell>
                        {item.detectedType === "tvshow" && item.season && item.episode ? (
                          <span className="font-mono text-sm">
                            S{String(item.season).padStart(2, "0")}E
                            {String(item.episode).padStart(2, "0")}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>{item.year || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={item.confidence || 0}
                            className="h-2 w-16"
                          />
                          <span
                            className={`text-xs font-medium ${getConfidenceColor(
                              item.confidence || 0
                            )}`}
                          >
                            {item.confidence}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(item.status || "pending")}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(item.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <FolderSearch className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Files Scanned</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
                Click Scan Library to detect media files from your configured folders.
                The scanner will parse movie names, TV show episodes, and more.
              </p>
              <Button 
                onClick={() => scanFolderMutation.mutate()}
                disabled={scanFolderMutation.isPending}
                data-testid="button-scan-first"
              >
                {scanFolderMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FolderSearch className="h-4 w-4 mr-2" />
                )}
                Scan Library
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-muted-foreground" />
            How It Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <Film className="h-4 w-4 text-blue-500" />
                Movie Detection
              </h4>
              <p className="text-sm text-muted-foreground">
                Extracts movie name and year from filenames like
                "Inception.2010.1080p.BluRay.mkv"
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <Tv className="h-4 w-4 text-purple-500" />
                TV Show Detection
              </h4>
              <p className="text-sm text-muted-foreground">
                Recognizes patterns like S01E05, 1x05, Season 1 Episode 5
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Auto Cleanup
              </h4>
              <p className="text-sm text-muted-foreground">
                Removes release groups (HDHub4u, YTS, etc.) and quality tags
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
