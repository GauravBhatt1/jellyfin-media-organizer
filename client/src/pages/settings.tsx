import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Settings as SettingsIcon,
  Save,
  Folder,
  Tv,
  Film,
  Loader2,
  AlertCircle,
  Search,
  Key,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Radio,
  Play,
  Square,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FolderPicker } from "@/components/folder-picker";

interface MonitoringStatus {
  isRunning: boolean;
  watchedPaths: string[];
  filesDetected: number;
  filesProcessed: number;
  lastActivity: string | null;
  recentErrors: string[];
}

interface AppSettings {
  moviesPaths: string[];
  tvShowsPaths: string[];
  autoOrganize: boolean;
  removeReleaseGroups: boolean;
  fuzzyMatchThreshold: number;
  tmdbApiKey: string;
}

const defaultSettings: AppSettings = {
  moviesPaths: ["/Movies"],
  tvShowsPaths: ["/TV Shows"],
  autoOrganize: false,
  removeReleaseGroups: true,
  fuzzyMatchThreshold: 80,
  tmdbApiKey: "",
};

type FolderPickerTarget = { type: "movies" | "tvshows"; index: number } | null;

export default function Settings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<FolderPickerTarget>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  const { data: savedSettings, isLoading } = useQuery<AppSettings>({
    queryKey: ["/api/settings"],
  });

  useEffect(() => {
    if (savedSettings) {
      // Handle migration from old single-path format
      const migrated: AppSettings = {
        ...defaultSettings,
        ...savedSettings,
        moviesPaths: Array.isArray(savedSettings.moviesPaths) 
          ? savedSettings.moviesPaths 
          : (savedSettings as any).moviesPath 
            ? [(savedSettings as any).moviesPath]
            : defaultSettings.moviesPaths,
        tvShowsPaths: Array.isArray(savedSettings.tvShowsPaths)
          ? savedSettings.tvShowsPaths
          : (savedSettings as any).tvShowsPath
            ? [(savedSettings as any).tvShowsPath]
            : defaultSettings.tvShowsPaths,
      };
      setSettings(migrated);
    }
  }, [savedSettings]);

  const saveMutation = useMutation({
    mutationFn: async (newSettings: AppSettings) => {
      return apiRequest("POST", "/api/settings", newSettings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings Saved",
        description: "Your settings have been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "There was an error saving your settings.",
        variant: "destructive",
      });
    },
  });

  const { data: monitoringStatus } = useQuery<MonitoringStatus>({
    queryKey: ["/api/monitoring/status"],
    refetchInterval: 3000,
  });

  const startMonitoringMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/monitoring/start", {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/status"] });
      toast({
        title: data.success ? "Monitoring Started" : "Already Running",
        description: data.message,
      });
    },
    onError: () => {
      toast({
        title: "Failed",
        description: "Could not start folder monitoring.",
        variant: "destructive",
      });
    },
  });

  const stopMonitoringMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/monitoring/stop", {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/monitoring/status"] });
      toast({
        title: data.success ? "Monitoring Stopped" : "Not Running",
        description: data.message,
      });
    },
    onError: () => {
      toast({
        title: "Failed",
        description: "Could not stop folder monitoring.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(settings);
  };

  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const addPath = (type: "movies" | "tvshows") => {
    if (type === "movies") {
      updateSetting("moviesPaths", [...settings.moviesPaths, ""]);
    } else {
      updateSetting("tvShowsPaths", [...settings.tvShowsPaths, ""]);
    }
  };

  const removePath = (type: "movies" | "tvshows", index: number) => {
    if (type === "movies") {
      const newPaths = settings.moviesPaths.filter((_, i) => i !== index);
      updateSetting("moviesPaths", newPaths.length > 0 ? newPaths : [""]);
    } else {
      const newPaths = settings.tvShowsPaths.filter((_, i) => i !== index);
      updateSetting("tvShowsPaths", newPaths.length > 0 ? newPaths : [""]);
    }
  };

  const updatePath = (type: "movies" | "tvshows", index: number, value: string) => {
    if (type === "movies") {
      const newPaths = [...settings.moviesPaths];
      newPaths[index] = value;
      updateSetting("moviesPaths", newPaths);
    } else {
      const newPaths = [...settings.tvShowsPaths];
      newPaths[index] = value;
      updateSetting("tvShowsPaths", newPaths);
    }
  };

  const openFolderPicker = (type: "movies" | "tvshows", index: number) => {
    setPickerTarget({ type, index });
    setFolderPickerOpen(true);
  };

  const handleFolderSelect = (path: string) => {
    if (pickerTarget) {
      updatePath(pickerTarget.type, pickerTarget.index, path);
    }
    setPickerTarget(null);
  };

  const getPickerTitle = () => {
    if (!pickerTarget) return "Select Folder";
    return pickerTarget.type === "movies" ? "Select Movies Folder" : "Select TV Shows Folder";
  };

  const getInitialPath = () => {
    if (!pickerTarget) return "/";
    const paths = pickerTarget.type === "movies" ? settings.moviesPaths : settings.tvShowsPaths;
    return paths[pickerTarget.index] || "/";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-settings-title">Settings</h1>
          <p className="text-muted-foreground">
            Configure paths and organization preferences
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          data-testid="button-save-settings"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Settings
        </Button>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Folder className="h-5 w-5" />
              Library Paths
            </CardTitle>
            <CardDescription>
              Add multiple folders for your media library. First folder in each list is the default destination.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-base">
                  <Film className="h-4 w-4 text-blue-500" />
                  Movies Folders
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addPath("movies")}
                  data-testid="button-add-movies-path"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {settings.moviesPaths.map((path, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={path}
                      onChange={(e) => updatePath("movies", index, e.target.value)}
                      placeholder="/path/to/Movies"
                      className="flex-1"
                      data-testid={`input-movies-path-${index}`}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => openFolderPicker("movies", index)}
                      data-testid={`button-browse-movies-${index}`}
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removePath("movies", index)}
                      disabled={settings.moviesPaths.length === 1 && path === ""}
                      data-testid={`button-remove-movies-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              {settings.moviesPaths.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  First folder is the default destination for organized movies
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-base">
                  <Tv className="h-4 w-4 text-purple-500" />
                  TV Shows Folders
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addPath("tvshows")}
                  data-testid="button-add-tvshows-path"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {settings.tvShowsPaths.map((path, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={path}
                      onChange={(e) => updatePath("tvshows", index, e.target.value)}
                      placeholder="/path/to/TV Shows"
                      className="flex-1"
                      data-testid={`input-tvshows-path-${index}`}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => openFolderPicker("tvshows", index)}
                      data-testid={`button-browse-tvshows-${index}`}
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removePath("tvshows", index)}
                      disabled={settings.tvShowsPaths.length === 1 && path === ""}
                      data-testid={`button-remove-tvshows-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              {settings.tvShowsPaths.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  First folder is the default destination for organized TV shows
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-green-500" />
              Smart Folder Monitoring
            </CardTitle>
            <CardDescription>
              Automatically detect and process new media files when they are added
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${monitoringStatus?.isRunning ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
                <div>
                  <p className="font-medium">
                    {monitoringStatus?.isRunning ? "Monitoring Active" : "Monitoring Stopped"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {monitoringStatus?.isRunning 
                      ? `Watching ${monitoringStatus.watchedPaths.length} folders`
                      : "Enable to automatically detect new files"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {monitoringStatus?.isRunning ? (
                  <Button
                    variant="outline"
                    onClick={() => stopMonitoringMutation.mutate()}
                    disabled={stopMonitoringMutation.isPending}
                    data-testid="button-stop-monitoring"
                  >
                    {stopMonitoringMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Square className="h-4 w-4 mr-2" />
                    )}
                    Stop
                  </Button>
                ) : (
                  <Button
                    onClick={() => startMonitoringMutation.mutate()}
                    disabled={startMonitoringMutation.isPending}
                    data-testid="button-start-monitoring"
                  >
                    {startMonitoringMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Start Monitoring
                  </Button>
                )}
              </div>
            </div>

            {monitoringStatus?.isRunning && (
              <>
                <Separator />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Files Detected</p>
                    <p className="text-lg font-semibold" data-testid="text-files-detected">
                      {monitoringStatus.filesDetected}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Files Processed</p>
                    <p className="text-lg font-semibold" data-testid="text-files-processed">
                      {monitoringStatus.filesProcessed}
                    </p>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <p className="text-xs text-muted-foreground">Last Activity</p>
                    <p className="text-sm" data-testid="text-last-activity">
                      {monitoringStatus.lastActivity 
                        ? new Date(monitoringStatus.lastActivity).toLocaleString()
                        : "No activity yet"}
                    </p>
                  </div>
                </div>
                {monitoringStatus.watchedPaths.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Watched Folders</p>
                    <div className="flex flex-wrap gap-2">
                      {monitoringStatus.watchedPaths.map((p, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {monitoringStatus.recentErrors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 text-destructive" />
                      Recent Errors
                    </p>
                    <div className="text-xs text-destructive space-y-1">
                      {monitoringStatus.recentErrors.map((err, i) => (
                        <p key={i}>{err}</p>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5" />
              Organization Options
            </CardTitle>
            <CardDescription>
              Configure how files are processed and organized
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-Organize New Files</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically organize files when they are scanned
                </p>
              </div>
              <Switch
                checked={settings.autoOrganize}
                onCheckedChange={(checked) => updateSetting("autoOrganize", checked)}
                data-testid="switch-auto-organize"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Remove Release Groups</Label>
                <p className="text-sm text-muted-foreground">
                  Strip HDHub4u, YTS, RARBG, etc. from filenames
                </p>
              </div>
              <Switch
                checked={settings.removeReleaseGroups}
                onCheckedChange={(checked) => updateSetting("removeReleaseGroups", checked)}
                data-testid="switch-remove-groups"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="threshold">Duplicate Match Threshold (%)</Label>
              <div className="flex items-center gap-4">
                <Input
                  id="threshold"
                  type="number"
                  min={50}
                  max={100}
                  value={settings.fuzzyMatchThreshold}
                  onChange={(e) =>
                    updateSetting("fuzzyMatchThreshold", parseInt(e.target.value) || 80)
                  }
                  className="w-24"
                  data-testid="input-match-threshold"
                />
                <p className="text-sm text-muted-foreground">
                  Minimum similarity to consider files as duplicates
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-amber-500" />
              TMDB API Settings
            </CardTitle>
            <CardDescription>
              Get your free API key from themoviedb.org for movie/TV metadata
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tmdbApiKey">TMDB API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="tmdbApiKey"
                    type={showApiKey ? "text" : "password"}
                    value={settings.tmdbApiKey}
                    onChange={(e) => updateSetting("tmdbApiKey", e.target.value)}
                    placeholder="Enter your TMDB API key"
                    className="pr-10"
                    data-testid="input-tmdb-api-key"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowApiKey(!showApiKey)}
                    data-testid="button-toggle-api-key"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Get your free API key at{" "}
                <a
                  href="https://www.themoviedb.org/settings/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  themoviedb.org/settings/api
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              File Naming Convention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                Files will be organized using Jellyfin-compatible naming:
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="bg-muted/50 rounded-md p-4">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Film className="h-4 w-4 text-blue-500" />
                    Movies
                  </h4>
                  <code className="text-xs block bg-background p-2 rounded">
                    Movies/Movie Name (Year)/Movie Name (Year).ext
                  </code>
                </div>
                <div className="bg-muted/50 rounded-md p-4">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Tv className="h-4 w-4 text-purple-500" />
                    TV Shows
                  </h4>
                  <code className="text-xs block bg-background p-2 rounded">
                    TV Shows/Series (Year)/Season XX/Series - SXXEXX.ext
                  </code>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <FolderPicker
        open={folderPickerOpen}
        onOpenChange={setFolderPickerOpen}
        onSelect={handleFolderSelect}
        title={getPickerTitle()}
        initialPath={getInitialPath()}
      />
    </div>
  );
}
