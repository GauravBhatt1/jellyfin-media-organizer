import { useQuery } from "@tanstack/react-query";
import {
  Film,
  Tv,
  FileVideo,
  AlertTriangle,
  Copy,
  CheckCircle2,
  Clock,
  FolderOpen,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

interface DashboardStats {
  totalMovies: number;
  totalTvShows: number;
  totalEpisodes: number;
  pendingItems: number;
  duplicates: number;
  organized: number;
  recentItems: Array<{
    id: string;
    originalFilename: string;
    detectedType: string;
    status: string;
    createdAt: string;
  }>;
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  variant = "default",
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  description?: string;
  variant?: "default" | "warning" | "success" | "destructive";
}) {
  const iconColors = {
    default: "text-primary",
    warning: "text-yellow-500",
    success: "text-green-500",
    destructive: "text-destructive",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${iconColors[variant]}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`stat-${title.toLowerCase().replace(/\s/g, "-")}`}>
          {value}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function RecentItemRow({
  item,
}: {
  item: DashboardStats["recentItems"][0];
}) {
  const statusColors = {
    pending: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    organized: "bg-green-500/10 text-green-600 dark:text-green-400",
    conflict: "bg-red-500/10 text-red-600 dark:text-red-400",
    duplicate: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  };

  const typeIcons = {
    movie: Film,
    tvshow: Tv,
    unknown: FileVideo,
  };

  const TypeIcon = typeIcons[item.detectedType as keyof typeof typeIcons] || FileVideo;

  return (
    <div className="flex items-center gap-3 py-3 border-b last:border-0" data-testid={`recent-item-${item.id}`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
        <TypeIcon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.originalFilename}</p>
        <p className="text-xs text-muted-foreground capitalize">{item.detectedType}</p>
      </div>
      <Badge
        variant="outline"
        className={statusColors[item.status as keyof typeof statusColors]}
      >
        {item.status}
      </Badge>
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading, refetch, isRefetching } = useQuery<DashboardStats>({
    queryKey: ["/api/stats"],
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your media library</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your media library</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isRefetching}
            data-testid="button-refresh-stats"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link href="/scanner">
            <Button data-testid="button-scan-files">
              <FolderOpen className="h-4 w-4 mr-2" />
              Scan Files
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Movies"
          value={stats?.totalMovies || 0}
          icon={Film}
          description="Total movies in library"
        />
        <StatCard
          title="TV Shows"
          value={stats?.totalTvShows || 0}
          icon={Tv}
          description="Total series"
        />
        <StatCard
          title="Episodes"
          value={stats?.totalEpisodes || 0}
          icon={FileVideo}
          description="Total episodes"
        />
        <StatCard
          title="Pending"
          value={stats?.pendingItems || 0}
          icon={Clock}
          description="Awaiting organization"
          variant="warning"
        />
        <StatCard
          title="Duplicates"
          value={stats?.duplicates || 0}
          icon={Copy}
          description="Need attention"
          variant={stats?.duplicates ? "destructive" : "default"}
        />
        <StatCard
          title="Organized"
          value={stats?.organized || 0}
          icon={CheckCircle2}
          description="Successfully organized"
          variant="success"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Recent Files</CardTitle>
              <CardDescription>Latest scanned media files</CardDescription>
            </div>
            <Link href="/scanner">
              <Button variant="ghost" size="sm" data-testid="button-view-all-files">
                View All
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {stats?.recentItems && stats.recentItems.length > 0 ? (
              <div className="space-y-1">
                {stats.recentItems.slice(0, 5).map((item) => (
                  <RecentItemRow key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileVideo className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-sm text-muted-foreground">No files scanned yet</p>
                <Link href="/scanner">
                  <Button variant="link" size="sm" className="mt-2">
                    Start scanning
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/scanner" className="block">
              <div className="flex items-center gap-3 p-3 rounded-md hover-elevate active-elevate-2 cursor-pointer border" data-testid="action-scan-new">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Scan New Files</p>
                  <p className="text-xs text-muted-foreground">
                    Detect and parse uploaded media
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>

            <Link href="/organizer" className="block">
              <div className="flex items-center gap-3 p-3 rounded-md hover-elevate active-elevate-2 cursor-pointer border" data-testid="action-organize">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-green-500/10">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Organize Files</p>
                  <p className="text-xs text-muted-foreground">
                    Move files to Jellyfin structure
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>

            <Link href="/duplicates" className="block">
              <div className="flex items-center gap-3 p-3 rounded-md hover-elevate active-elevate-2 cursor-pointer border" data-testid="action-duplicates">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-orange-500/10">
                  <Copy className="h-5 w-5 text-orange-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Manage Duplicates</p>
                  <p className="text-xs text-muted-foreground">
                    Review and remove duplicate files
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>

            <Link href="/settings" className="block">
              <div className="flex items-center gap-3 p-3 rounded-md hover-elevate active-elevate-2 cursor-pointer border" data-testid="action-settings">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Configure Paths</p>
                  <p className="text-xs text-muted-foreground">
                    Set source and destination folders
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
