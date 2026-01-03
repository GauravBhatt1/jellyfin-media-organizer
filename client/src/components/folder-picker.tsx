import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Folder, FolderOpen, ArrowUp, Check, Loader2, File } from "lucide-react";

interface FolderItem {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface FolderResponse {
  currentPath: string;
  parent: string | null;
  items: FolderItem[];
}

interface FolderPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
  title?: string;
  initialPath?: string;
}

export function FolderPicker({
  open,
  onOpenChange,
  onSelect,
  title = "Select Folder",
  initialPath = "/",
}: FolderPickerProps) {
  const [currentPath, setCurrentPath] = useState(initialPath);

  // Reset to initialPath when dialog opens or initialPath changes
  useEffect(() => {
    if (open) {
      setCurrentPath(initialPath || "/");
    }
  }, [open, initialPath]);

  const { data, isLoading } = useQuery<FolderResponse>({
    queryKey: ["/api/folders", currentPath],
    queryFn: async () => {
      const res = await fetch(`/api/folders?path=${encodeURIComponent(currentPath)}`);
      if (!res.ok) throw new Error("Failed to load folders");
      return res.json();
    },
    enabled: open,
  });

  const handleSelect = () => {
    onSelect(currentPath);
    onOpenChange(false);
  };

  const navigateTo = (path: string) => {
    setCurrentPath(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
            <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
            <code className="text-sm truncate flex-1" data-testid="text-current-path">
              {data?.currentPath || currentPath}
            </code>
          </div>

          <ScrollArea className="h-[300px] border rounded-md">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {data?.parent && (
                  <button
                    onClick={() => navigateTo(data.parent!)}
                    className="flex items-center gap-2 w-full p-2 text-left rounded-md hover-elevate"
                    data-testid="button-parent-folder"
                  >
                    <ArrowUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">..</span>
                  </button>
                )}

                {data?.items.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => item.isDirectory && navigateTo(item.path)}
                    disabled={!item.isDirectory}
                    className={`flex items-center gap-2 w-full p-2 text-left rounded-md ${
                      item.isDirectory
                        ? "hover-elevate cursor-pointer"
                        : "opacity-50 cursor-not-allowed"
                    }`}
                    data-testid={`folder-item-${item.name}`}
                  >
                    {item.isDirectory ? (
                      <Folder className="h-4 w-4 text-yellow-500" />
                    ) : (
                      <File className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm truncate">{item.name}</span>
                  </button>
                ))}

                {data?.items.length === 0 && (
                  <div className="text-center text-muted-foreground text-sm py-8">
                    Empty folder
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-folder">
            Cancel
          </Button>
          <Button onClick={handleSelect} data-testid="button-select-folder">
            <Check className="h-4 w-4 mr-2" />
            Select This Folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
