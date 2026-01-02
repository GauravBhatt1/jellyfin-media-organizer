import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  FolderTree,
  ArrowRight,
  Check,
  X,
  Loader2,
  FileVideo,
  Film,
  Tv,
  FolderOpen,
  ChevronRight,
  AlertCircle,
  TestTube2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { MediaItem } from "@shared/schema";

interface OrganizationPreview {
  id: string;
  originalFilename: string;
  originalPath: string;
  destinationPath: string;
  detectedType: string;
  detectedName: string;
  season?: number;
  episode?: number;
  year?: number;
}

interface TestResult {
  id: string;
  status: 'verified' | 'failed';
  error?: string;
}

export default function Organizer() {
  const { toast } = useToast();
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [organizeProgress, setOrganizeProgress] = useState({ current: 0, total: 0 });

  const { data: pendingItems, isLoading } = useQuery<MediaItem[]>({
    queryKey: ["/api/media-items", "pending"],
  });

  const { data: preview, isLoading: previewLoading } = useQuery<OrganizationPreview[]>({
    queryKey: ["/api/organize/preview"],
  });

  // Organize files in batches to avoid timeout
  const organizeInBatches = async (ids: string[]) => {
    const BATCH_SIZE = 25;
    setIsOrganizing(true);
    setOrganizeProgress({ current: 0, total: ids.length });
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      try {
        await apiRequest("POST", "/api/organize", { ids: batch });
        successCount += batch.length;
      } catch (err) {
        errorCount += batch.length;
      }
      setOrganizeProgress({ current: Math.min(i + BATCH_SIZE, ids.length), total: ids.length });
    }
    
    queryClient.invalidateQueries({ queryKey: ["/api/media-items"] });
    queryClient.invalidateQueries({ queryKey: ["/api/organize/preview"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    setSelectedItems(new Set());
    setIsOrganizing(false);
    
    if (errorCount > 0) {
      toast({
        title: "Organization Completed with Errors",
        description: `${successCount} files organized, ${errorCount} failed.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Organization Complete",
        description: `${successCount} files have been organized.`,
      });
    }
  };

  // Test run - verify paths without moving files
  const handleTestRun = async () => {
    if (!preview || preview.length === 0) return;
    
    setIsTesting(true);
    setTestResults([]);
    
    try {
      const response = await apiRequest("POST", "/api/organize", { 
        ids: preview.map(p => p.id),
        dryRun: true 
      });
      const data = await response.json();
      
      const results: TestResult[] = [];
      
      // Add verified items
      if (data.organized && Array.isArray(data.organized)) {
        for (const item of data.organized) {
          results.push({ id: item.id, status: 'verified' });
        }
      } else if (typeof data.organized === 'number') {
        // Old format - all verified
        preview.slice(0, data.organized).forEach(p => {
          results.push({ id: p.id, status: 'verified' });
        });
      }
      
      // Add failed items
      if (data.errors && Array.isArray(data.errors)) {
        for (const err of data.errors) {
          results.push({ id: err.id, status: 'failed', error: err.error });
        }
      }
      
      setTestResults(results);
      
      const failedCount = results.filter(r => r.status === 'failed').length;
      const verifiedCount = results.filter(r => r.status === 'verified').length;
      
      if (failedCount > 0) {
        toast({
          title: "Test Run Complete - Issues Found",
          description: `${verifiedCount} verified, ${failedCount} failed. Check errors before organizing.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Test Run Successful",
          description: `All ${verifiedCount} files verified. Safe to organize!`,
        });
      }
    } catch (err) {
      toast({
        title: "Test Run Failed",
        description: "Could not verify paths. Check settings.",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const getTestStatus = (id: string) => {
    return testResults.find(r => r.id === id);
  };

  const organizeMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return apiRequest("POST", "/api/organize", { ids });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/media-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organize/preview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setSelectedItems(new Set());
      toast({
        title: "Organization Complete",
        description: `${variables.length} files have been organized.`,
      });
    },
    onError: () => {
      toast({
        title: "Organization Failed",
        description: "There was an error organizing the files.",
        variant: "destructive",
      });
    },
  });

  const handleSelectAll = () => {
    if (preview && selectedItems.size === preview.length) {
      setSelectedItems(new Set());
    } else if (preview) {
      setSelectedItems(new Set(preview.map((item) => item.id)));
    }
  };

  const handleSelectItem = (id: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedItems(newSet);
  };

  const handleOrganize = () => {
    if (selectedItems.size === 0) {
      toast({
        title: "No Selection",
        description: "Please select files to organize.",
        variant: "destructive",
      });
      return;
    }
    organizeMutation.mutate(Array.from(selectedItems));
  };

  const handleOrganizeAll = () => {
    if (preview && preview.length > 0) {
      // Use batching for large numbers
      if (preview.length > 50) {
        organizeInBatches(preview.map((item) => item.id));
      } else {
        organizeMutation.mutate(preview.map((item) => item.id));
      }
    }
  };

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

  const formatDestinationPath = (path: string) => {
    const parts = path.split("/").filter(Boolean);
    return (
      <div className="flex flex-wrap items-center gap-1 text-sm">
        {parts.map((part, index) => (
          <span key={index} className="flex items-center gap-1">
            {index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            <span className={index === parts.length - 1 ? "font-medium" : "text-muted-foreground"}>
              {part}
            </span>
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-organizer-title">File Organizer</h1>
          <p className="text-muted-foreground">
            Preview and apply Jellyfin-compatible folder structure
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="secondary"
            onClick={handleTestRun}
            disabled={!preview || preview.length === 0 || isTesting || isOrganizing}
            data-testid="button-test-run"
          >
            {isTesting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <TestTube2 className="h-4 w-4 mr-2" />
            )}
            Test Run
          </Button>
          <Button
            variant="outline"
            onClick={handleOrganize}
            disabled={selectedItems.size === 0 || organizeMutation.isPending}
            data-testid="button-organize-selected"
          >
            {organizeMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Organize Selected ({selectedItems.size})
          </Button>
          <Button
            onClick={handleOrganizeAll}
            disabled={!preview || preview.length === 0 || organizeMutation.isPending || isOrganizing}
            data-testid="button-organize-all"
          >
            {isOrganizing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {organizeProgress.current}/{organizeProgress.total}
              </>
            ) : (
              <>
                <FolderTree className="h-4 w-4 mr-2" />
                Organize All
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span>Pending Files</span>
              <Badge variant="secondary">{preview?.length || 0}</Badge>
            </CardTitle>
            <CardDescription>
              Files waiting to be organized into Jellyfin structure
            </CardDescription>
          </CardHeader>
          <CardContent>
            {previewLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : preview && preview.length > 0 ? (
              <>
                <div className="flex items-center gap-2 mb-4 pb-4 border-b">
                  <Checkbox
                    checked={selectedItems.size === preview.length}
                    onCheckedChange={handleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                  <span className="text-sm text-muted-foreground">
                    Select All ({preview.length} files)
                  </span>
                </div>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {preview.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 p-3 rounded-md border transition-colors ${
                          selectedItems.has(item.id)
                            ? "bg-primary/5 border-primary/20"
                            : "hover:bg-muted/50"
                        }`}
                        data-testid={`preview-item-${item.id}`}
                      >
                        <Checkbox
                          checked={selectedItems.has(item.id)}
                          onCheckedChange={() => handleSelectItem(item.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2">
                            {getTypeIcon(item.detectedType)}
                            <span className="font-medium text-sm">
                              {item.detectedName}
                            </span>
                            {item.detectedType === "tvshow" && item.season && item.episode && (
                              <Badge variant="outline" className="text-xs">
                                S{String(item.season).padStart(2, "0")}E
                                {String(item.episode).padStart(2, "0")}
                              </Badge>
                            )}
                            {item.year && (
                              <Badge variant="secondary" className="text-xs">
                                {item.year}
                              </Badge>
                            )}
                            {getTestStatus(item.id)?.status === 'verified' && (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                            {getTestStatus(item.id)?.status === 'failed' && (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                          </div>
                          {getTestStatus(item.id)?.error && (
                            <p className="text-xs text-red-500">
                              {getTestStatus(item.id)?.error}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground font-mono truncate">
                            {item.originalFilename}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 mb-4">
                  <Check className="h-8 w-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">All Organized!</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  No pending files to organize. Scan new files to add them to the queue.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Destination Preview</CardTitle>
            <CardDescription>
              Where files will be moved in your Jellyfin library
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preview && preview.length > 0 ? (
              <ScrollArea className="h-[450px]">
                <div className="space-y-4">
                  {preview
                    .filter((item) => selectedItems.size === 0 || selectedItems.has(item.id))
                    .map((item) => (
                      <div
                        key={item.id}
                        className="space-y-2 p-3 rounded-md bg-muted/30"
                        data-testid={`destination-preview-${item.id}`}
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <FolderOpen className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-xs text-muted-foreground truncate">
                            {item.originalFilename}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ArrowRight className="h-4 w-4 text-primary" />
                          {formatDestinationPath(item.destinationPath)}
                        </div>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FolderTree className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-sm text-muted-foreground">
                  Select files to preview destination paths
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-500" />
            Folder Structure
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <Film className="h-4 w-4 text-blue-500" />
                Movies Structure
              </h4>
              <div className="bg-muted/50 rounded-md p-4 font-mono text-xs space-y-1">
                <p className="text-muted-foreground">Movies/</p>
                <p className="pl-4">Movie Name (2024)/</p>
                <p className="pl-8 text-primary">Movie Name (2024).mkv</p>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <Tv className="h-4 w-4 text-purple-500" />
                TV Shows Structure
              </h4>
              <div className="bg-muted/50 rounded-md p-4 font-mono text-xs space-y-1">
                <p className="text-muted-foreground">TV Shows/</p>
                <p className="pl-4">Series Name (2024)/</p>
                <p className="pl-8">Season 01/</p>
                <p className="pl-12 text-primary">Series Name - S01E01.mkv</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
