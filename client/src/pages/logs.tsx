import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  RefreshCw,
  Check,
  X,
  ArrowRight,
  Clock,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { queryClient } from "@/lib/queryClient";
import type { OrganizationLog } from "@shared/schema";

export default function Logs() {
  const [actionFilter, setActionFilter] = useState<string>("all");

  const { data: logs, isLoading, refetch, isRefetching } = useQuery<OrganizationLog[]>({
    queryKey: ["/api/logs"],
  });

  const filteredLogs = logs?.filter((log) =>
    actionFilter === "all" ? true : log.action === actionFilter
  );

  const formatDate = (dateString: string | Date | null) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const getActionBadge = (action: string) => {
    const variants: Record<string, string> = {
      organize: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
      delete: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
      scan: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      duplicate: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    };
    return (
      <Badge variant="outline" className={variants[action] || "bg-muted"}>
        {action}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-logs-title">Activity Logs</h1>
          <p className="text-muted-foreground">
            View history of all organization actions
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isRefetching}
          data-testid="button-refresh-logs"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-actions">
              {logs?.length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Successful
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {logs?.filter((l) => l.success).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {logs?.filter((l) => !l.success).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Organize Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {logs?.filter((l) => l.action === "organize").length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Activity History</CardTitle>
              <CardDescription>
                All file organization and management actions
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-32" data-testid="select-action-filter">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="organize">Organize</SelectItem>
                  <SelectItem value="scan">Scan</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                  <SelectItem value="duplicate">Duplicate</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
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
          ) : filteredLogs && filteredLogs.length > 0 ? (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 rounded-md border"
                    data-testid={`log-entry-${log.id}`}
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${
                        log.success
                          ? "bg-green-500/10"
                          : "bg-red-500/10"
                      }`}
                    >
                      {log.success ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <X className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getActionBadge(log.action)}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(log.createdAt)}
                        </span>
                      </div>
                      {log.fromPath && log.toPath && (
                        <div className="text-sm space-y-1">
                          <div className="flex items-start gap-2">
                            <span className="text-muted-foreground shrink-0">From:</span>
                            <code className="text-xs bg-muted px-1 py-0.5 rounded truncate block">
                              {log.fromPath}
                            </code>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-muted-foreground shrink-0">To:</span>
                            <code className="text-xs bg-muted px-1 py-0.5 rounded truncate block">
                              {log.toPath}
                            </code>
                          </div>
                        </div>
                      )}
                      {log.message && (
                        <p className="text-sm text-muted-foreground">{log.message}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Logs Yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Activity logs will appear here as you scan and organize files.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
