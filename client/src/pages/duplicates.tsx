import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Copy,
  Trash2,
  Check,
  AlertTriangle,
  FileVideo,
  Loader2,
  RefreshCw,
  Eye,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface DuplicateGroup {
  groupId: string;
  baseName: string;
  items: Array<{
    id: string;
    originalFilename: string;
    cleanedName: string;
    similarity: number;
    fileSize?: string;
    isOriginal: boolean;
  }>;
}

export default function Duplicates() {
  const { toast } = useToast();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const { data: duplicates, isLoading, refetch, isRefetching } = useQuery<DuplicateGroup[]>({
    queryKey: ["/api/duplicates"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/media-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/duplicates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/media-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Deleted",
        description: "Duplicate file has been removed.",
      });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return apiRequest("POST", "/api/media-items/bulk-delete", { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/duplicates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/media-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Duplicates Removed",
        description: "All duplicate files in the group have been removed.",
      });
    },
  });

  const scanDuplicatesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/duplicates/scan");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/duplicates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Scan Complete",
        description: "Duplicate detection has been completed.",
      });
    },
  });

  const toggleGroup = (groupId: string) => {
    const newSet = new Set(expandedGroups);
    if (newSet.has(groupId)) {
      newSet.delete(groupId);
    } else {
      newSet.add(groupId);
    }
    setExpandedGroups(newSet);
  };

  const handleDeleteDuplicates = (group: DuplicateGroup) => {
    const duplicateIds = group.items
      .filter((item) => !item.isOriginal)
      .map((item) => item.id);
    deleteGroupMutation.mutate(duplicateIds);
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 90) return "bg-red-500";
    if (similarity >= 75) return "bg-orange-500";
    return "bg-yellow-500";
  };

  const totalDuplicates = duplicates?.reduce(
    (acc, group) => acc + group.items.filter((item) => !item.isOriginal).length,
    0
  ) || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-duplicates-title">Duplicate Manager</h1>
          <p className="text-muted-foreground">
            Find and remove duplicate files using fuzzy matching
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isRefetching}
            data-testid="button-refresh-duplicates"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={() => scanDuplicatesMutation.mutate()}
            disabled={scanDuplicatesMutation.isPending}
            data-testid="button-scan-duplicates"
          >
            {scanDuplicatesMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Scan for Duplicates
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Duplicate Groups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-duplicate-groups">
              {duplicates?.length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Duplicates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500" data-testid="stat-total-duplicates">
              {totalDuplicates}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Detection Method
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">Fuzzy Matching</div>
            <p className="text-xs text-muted-foreground mt-1">
              Removes release groups, quality tags
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Duplicate Groups</CardTitle>
          <CardDescription>
            Files with similar names after removing release groups and quality tags
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : duplicates && duplicates.length > 0 ? (
            <ScrollArea className="h-[500px]">
              <div className="space-y-4">
                {duplicates.map((group) => (
                  <div
                    key={group.groupId}
                    className="border rounded-lg overflow-hidden"
                    data-testid={`duplicate-group-${group.groupId}`}
                  >
                    <div
                      className="flex items-center justify-between gap-4 p-4 bg-muted/30 cursor-pointer hover-elevate"
                      onClick={() => toggleGroup(group.groupId)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-orange-500/10">
                          <Copy className="h-5 w-5 text-orange-500" />
                        </div>
                        <div>
                          <p className="font-medium">{group.baseName}</p>
                          <p className="text-sm text-muted-foreground">
                            {group.items.length} files in this group
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-orange-500/10 text-orange-600 dark:text-orange-400">
                          {group.items.filter((i) => !i.isOriginal).length} duplicates
                        </Badge>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`button-delete-group-${group.groupId}`}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Remove Duplicates
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove Duplicates?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will remove {group.items.filter((i) => !i.isOriginal).length} duplicate
                                files and keep only the original. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteDuplicates(group)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remove Duplicates
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    {expandedGroups.has(group.groupId) && (
                      <div className="p-4 space-y-3 bg-background">
                        {group.items.map((item, index) => (
                          <div
                            key={item.id}
                            className={`flex items-center gap-3 p-3 rounded-md ${
                              item.isOriginal
                                ? "bg-green-500/5 border border-green-500/20"
                                : "bg-muted/50"
                            }`}
                            data-testid={`duplicate-item-${item.id}`}
                          >
                            <FileVideo className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-mono truncate">
                                  {item.originalFilename}
                                </p>
                                {item.isOriginal && (
                                  <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                                    <Check className="h-3 w-3 mr-1" />
                                    Original
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-4 mt-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    Similarity:
                                  </span>
                                  <Progress
                                    value={item.similarity}
                                    className={`h-1.5 w-16 ${getSimilarityColor(item.similarity)}`}
                                  />
                                  <span className="text-xs font-medium">
                                    {item.similarity}%
                                  </span>
                                </div>
                                {item.fileSize && (
                                  <span className="text-xs text-muted-foreground">
                                    {item.fileSize}
                                  </span>
                                )}
                              </div>
                            </div>
                            {!item.isOriginal && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteMutation.mutate(item.id)}
                                disabled={deleteMutation.isPending}
                                data-testid={`button-delete-item-${item.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 mb-4">
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Duplicates Found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
                Your library looks clean! Scan again after adding new files.
              </p>
              <Button
                variant="outline"
                onClick={() => scanDuplicatesMutation.mutate()}
                disabled={scanDuplicatesMutation.isPending}
              >
                <Copy className="h-4 w-4 mr-2" />
                Scan Again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            How Duplicate Detection Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              The duplicate detector uses fuzzy matching to find similar files even when their names
              aren't exactly the same. Here's what it does:
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h4 className="font-medium">Removes Common Tags</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>Release groups: HDHub4u, YTS, RARBG, 1337x</li>
                  <li>Quality tags: 720p, 1080p, 4K, HDRip</li>
                  <li>Codec info: x264, x265, HEVC, AAC</li>
                  <li>Language tags: Hindi, English, Dual Audio</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Example Match</h4>
                <div className="bg-muted/50 rounded-md p-3 font-mono text-xs space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Input 1:</span>
                    <span>Mirzapur.S01E01.720p</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Input 2:</span>
                    <span>Mirzapur HDHub4u S01E01</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex items-center gap-2 text-green-500">
                    <ArrowRight className="h-3 w-3" />
                    <span>Both match: "mirzapur s01e01"</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
