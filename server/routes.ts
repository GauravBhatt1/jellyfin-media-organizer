import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { RELEASE_GROUPS, type MediaType } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Helper functions for parsing filenames
function cleanFilename(filename: string): string {
  let cleaned = filename;

  const extMatch = filename.match(/\.[a-zA-Z0-9]{2,4}$/);
  if (extMatch) {
    cleaned = cleaned.slice(0, -extMatch[0].length);
  }

  cleaned = cleaned.replace(/[._]/g, " ");
  cleaned = cleaned.replace(/\[.*?\]/g, " ");
  cleaned = cleaned.replace(/\((?!(?:19|20)\d{2}\))[^)]*\)/g, " ");

  for (const group of RELEASE_GROUPS) {
    const regex = new RegExp(`\\b${group}\\b`, "gi");
    cleaned = cleaned.replace(regex, " ");
  }

  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

function extractYear(filename: string): number | null {
  const parenMatch = filename.match(/\(?(19[5-9]\d|20[0-2]\d)\)?/);
  if (parenMatch) {
    return parseInt(parenMatch[1], 10);
  }
  return null;
}

function detectTVShowPattern(filename: string): { season: number; episode: number } | null {
  const patterns = [
    /[Ss](\d{1,2})[Ee](\d{1,3})/,
    /(\d{1,2})[xX](\d{1,3})/,
    /[Ss]eason\s*(\d{1,2})\s*[Ee]pisode\s*(\d{1,3})/i,
    /[Ss](\d{1,2})\s+[Ee](\d{1,3})/,
    /[Ee][Pp]?(\d{1,3})(?!\d)/,
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      if (match.length === 2) {
        return { season: 1, episode: parseInt(match[1], 10) };
      }
      return {
        season: parseInt(match[1], 10),
        episode: parseInt(match[2], 10),
      };
    }
  }

  return null;
}

function getExtension(filename: string): string {
  const match = filename.match(/\.[a-zA-Z0-9]{2,4}$/);
  return match ? match[0].toLowerCase() : "";
}

function parseMediaFilename(filename: string): {
  cleanedName: string;
  detectedType: MediaType;
  detectedName: string;
  year: number | null;
  season: number | null;
  episode: number | null;
  extension: string;
  confidence: number;
} {
  const extension = getExtension(filename);
  const cleanedName = cleanFilename(filename);
  const year = extractYear(filename);
  const tvPattern = detectTVShowPattern(filename);

  let detectedType: MediaType = "unknown";
  let detectedName = cleanedName;
  let confidence = 50;

  if (tvPattern) {
    detectedType = "tvshow";
    confidence = 80;

    const nameMatch = filename.match(/^(.+?)(?:[Ss]\d|Season|\d+[xX])/i);
    if (nameMatch) {
      detectedName = cleanFilename(nameMatch[1]);
    }
  } else if (year) {
    detectedType = "movie";
    confidence = 70;

    const yearIndex = filename.indexOf(year.toString());
    if (yearIndex > 0) {
      detectedName = cleanFilename(filename.substring(0, yearIndex));
    }
  }

  if (detectedName.length > 3 && detectedName.length < 100) {
    confidence += 10;
  }

  return {
    cleanedName,
    detectedType,
    detectedName: detectedName || cleanedName,
    year,
    season: tvPattern?.season || null,
    episode: tvPattern?.episode || null,
    extension,
    confidence: Math.min(confidence, 100),
  };
}

function generateDestinationPath(
  parsed: ReturnType<typeof parseMediaFilename>,
  detectedName: string,
  basePaths: { movies: string; tvshows: string }
): string {
  const { detectedType, year, season, episode, extension } = parsed;

  const titleCase = (str: string) =>
    str.replace(/\b\w/g, (c) => c.toUpperCase());

  const formattedName = titleCase(detectedName);
  const yearStr = year ? ` (${year})` : "";

  if (detectedType === "movie") {
    const folderName = `${formattedName}${yearStr}`;
    const fileName = `${formattedName}${yearStr}${extension}`;
    return `${basePaths.movies}/${folderName}/${fileName}`;
  }

  if (detectedType === "tvshow" && season !== null && episode !== null) {
    const seriesFolder = `${formattedName}${yearStr}`;
    const seasonFolder = `Season ${season.toString().padStart(2, "0")}`;
    const episodeStr = `S${season.toString().padStart(2, "0")}E${episode.toString().padStart(2, "0")}`;
    const fileName = `${formattedName} - ${episodeStr}${extension}`;
    return `${basePaths.tvshows}/${seriesFolder}/${seasonFolder}/${fileName}`;
  }

  return `${basePaths.movies}/Unsorted/${parsed.cleanedName}${extension}`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Stats endpoint
  app.get("/api/stats", async (req, res) => {
    try {
      const mediaItems = await storage.getAllMediaItems();
      const movies = await storage.getAllMovies();
      const tvSeries = await storage.getAllTvSeries();

      const pendingItems = mediaItems.filter((i) => i.status === "pending").length;
      const duplicates = mediaItems.filter((i) => i.status === "duplicate").length;
      const organized = mediaItems.filter((i) => i.status === "organized").length;

      const totalEpisodes = mediaItems.filter(
        (i) => i.detectedType === "tvshow" && i.status === "organized"
      ).length;

      res.json({
        totalMovies: movies.length,
        totalTvShows: tvSeries.length,
        totalEpisodes,
        pendingItems,
        duplicates,
        organized,
        recentItems: mediaItems.slice(0, 10).map((item) => ({
          id: item.id,
          originalFilename: item.originalFilename,
          detectedType: item.detectedType,
          status: item.status,
          createdAt: item.createdAt,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Media Items endpoints
  app.get("/api/media-items", async (req, res) => {
    try {
      const items = await storage.getAllMediaItems();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch media items" });
    }
  });

  app.get("/api/media-items/pending", async (req, res) => {
    try {
      const items = await storage.getPendingMediaItems();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending items" });
    }
  });

  app.delete("/api/media-items/:id", async (req, res) => {
    try {
      const success = await storage.deleteMediaItem(req.params.id);
      if (success) {
        await storage.createLog({
          mediaItemId: req.params.id,
          action: "delete",
          success: true,
          message: "Media item deleted",
        });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Item not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to delete item" });
    }
  });

  app.post("/api/media-items/bulk-delete", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: "ids must be an array" });
      }
      const count = await storage.bulkDeleteMediaItems(ids);
      await storage.createLog({
        action: "delete",
        success: true,
        message: `Bulk deleted ${count} items`,
      });
      res.json({ deleted: count });
    } catch (error) {
      res.status(500).json({ error: "Failed to bulk delete" });
    }
  });

  // Scan endpoint
  app.post("/api/scan", async (req, res) => {
    try {
      const { filenames } = req.body;
      if (!Array.isArray(filenames)) {
        return res.status(400).json({ error: "filenames must be an array" });
      }

      const settings = await storage.getAllSettings();
      const sourcePath = settings.sourcePath || "/Inbox";
      const results = [];

      for (const filename of filenames) {
        const parsed = parseMediaFilename(filename);
        const moviesPath = settings.moviesPath || "/Movies";
        const tvShowsPath = settings.tvShowsPath || "/TV Shows";

        const destinationPath = generateDestinationPath(parsed, parsed.detectedName, {
          movies: moviesPath,
          tvshows: tvShowsPath,
        });

        const item = await storage.createMediaItem({
          originalFilename: filename,
          originalPath: `${sourcePath}/${filename}`,
          extension: parsed.extension,
          detectedType: parsed.detectedType,
          detectedName: parsed.detectedName,
          cleanedName: parsed.cleanedName,
          year: parsed.year,
          season: parsed.season,
          episode: parsed.episode,
          status: "pending",
          destinationPath,
          confidence: parsed.confidence,
        });

        results.push(item);
      }

      await storage.createLog({
        action: "scan",
        success: true,
        message: `Scanned ${results.length} files`,
      });

      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to scan files" });
    }
  });

  // Scan actual files from source folder (library scan)
  app.post("/api/scan-folder", async (req, res) => {
    try {
      const settings = await storage.getAllSettings();
      const sourcePath = settings.sourcePath || "/Inbox";
      const moviesPath = settings.moviesPath || "/Movies";
      const tvShowsPath = settings.tvShowsPath || "/TV Shows";

      // In Docker, VPS root is mounted at /host
      const HOST_PREFIX = "/host";
      const isDocker = fs.existsSync(HOST_PREFIX);
      
      const actualSourcePath = isDocker 
        ? HOST_PREFIX + sourcePath 
        : sourcePath;

      // Check if source folder exists
      if (!fs.existsSync(actualSourcePath)) {
        return res.status(400).json({ 
          error: `Source folder not found: ${sourcePath}. Please set the correct path in Settings.` 
        });
      }

      // Video file extensions
      const videoExtensions = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.m4v', '.webm', '.flv', '.ts', '.m2ts'];
      
      // Recursively find all video files
      const findVideoFiles = (dir: string, files: string[] = []): string[] => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              findVideoFiles(fullPath, files);
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if (videoExtensions.includes(ext)) {
                files.push(fullPath);
              }
            }
          }
        } catch (e) {
          // Skip unreadable directories
        }
        return files;
      };

      const videoFiles = findVideoFiles(actualSourcePath);
      const results = [];

      for (const filePath of videoFiles) {
        const filename = path.basename(filePath);
        
        // Check if already scanned
        const existing = await storage.getMediaItemByFilename(filename);
        if (existing) continue;

        const parsed = parseMediaFilename(filename);
        const destinationPath = generateDestinationPath(parsed, parsed.detectedName, {
          movies: moviesPath,
          tvshows: tvShowsPath,
        });

        // Convert back to user-facing path
        const userPath = isDocker 
          ? filePath.replace(HOST_PREFIX, '') 
          : filePath;

        const item = await storage.createMediaItem({
          originalFilename: filename,
          originalPath: userPath,
          extension: parsed.extension,
          detectedType: parsed.detectedType,
          detectedName: parsed.detectedName,
          cleanedName: parsed.cleanedName,
          year: parsed.year,
          season: parsed.season,
          episode: parsed.episode,
          status: "pending",
          destinationPath,
          confidence: parsed.confidence,
        });

        results.push(item);
      }

      await storage.createLog({
        action: "scan-folder",
        success: true,
        message: `Scanned ${sourcePath}: found ${videoFiles.length} video files, ${results.length} new`,
      });

      res.json({ 
        scanned: videoFiles.length, 
        newItems: results.length, 
        items: results 
      });
    } catch (error) {
      console.error("Scan folder error:", error);
      res.status(500).json({ error: "Failed to scan folder" });
    }
  });

  // Organization preview endpoint
  app.get("/api/organize/preview", async (req, res) => {
    try {
      const pendingItems = await storage.getPendingMediaItems();
      const settings = await storage.getAllSettings();

      const previews = pendingItems.map((item) => ({
        id: item.id,
        originalFilename: item.originalFilename,
        originalPath: item.originalPath,
        destinationPath: item.destinationPath || "",
        detectedType: item.detectedType,
        detectedName: item.detectedName,
        season: item.season,
        episode: item.episode,
        year: item.year,
      }));

      res.json(previews);
    } catch (error) {
      res.status(500).json({ error: "Failed to generate preview" });
    }
  });

  // Organize endpoint
  app.post("/api/organize", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: "ids must be an array" });
      }

      const organized = [];

      for (const id of ids) {
        const item = await storage.getMediaItemById(id);
        if (!item) continue;

        // Update item status
        await storage.updateMediaItem(id, { status: "organized" });

        // Create movie or TV series entry
        if (item.detectedType === "movie" && item.detectedName) {
          const existingMovie = await storage.getMovieByName(item.detectedName);
          if (!existingMovie) {
            await storage.createMovie({
              name: item.detectedName,
              cleanedName: item.cleanedName || item.detectedName,
              year: item.year,
              filePath: item.destinationPath,
            });
          }
        } else if (item.detectedType === "tvshow" && item.detectedName) {
          let series = await storage.getTvSeriesByName(item.detectedName);
          if (!series) {
            series = await storage.createTvSeries({
              name: item.detectedName,
              cleanedName: item.cleanedName || item.detectedName,
              year: item.year,
              totalSeasons: item.season || 1,
              totalEpisodes: 1,
            });
          } else {
            // Update total seasons/episodes
            await storage.updateTvSeries(series.id, {
              totalSeasons: Math.max(series.totalSeasons || 0, item.season || 0),
              totalEpisodes: (series.totalEpisodes || 0) + 1,
            });
          }
        }

        // Create log
        await storage.createLog({
          mediaItemId: id,
          action: "organize",
          fromPath: item.originalPath,
          toPath: item.destinationPath,
          success: true,
          message: `Organized ${item.detectedType}: ${item.detectedName}`,
        });

        organized.push(id);
      }

      res.json({ organized: organized.length });
    } catch (error) {
      res.status(500).json({ error: "Failed to organize files" });
    }
  });

  // Duplicates endpoints
  app.get("/api/duplicates", async (req, res) => {
    try {
      const settings = await storage.getAllSettings();
      const threshold = parseInt(settings.fuzzyMatchThreshold || "80", 10);
      const duplicates = await storage.findDuplicates(threshold);
      res.json(duplicates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch duplicates" });
    }
  });

  app.post("/api/duplicates/scan", async (req, res) => {
    try {
      const settings = await storage.getAllSettings();
      const threshold = parseInt(settings.fuzzyMatchThreshold || "80", 10);
      const duplicates = await storage.findDuplicates(threshold);

      // Mark items as duplicates
      for (const group of duplicates) {
        for (const item of group.items) {
          if (!item.isOriginal) {
            await storage.updateMediaItem(item.id, {
              status: "duplicate",
              duplicateOf: group.items.find((i: any) => i.isOriginal)?.id,
            });
          }
        }
      }

      await storage.createLog({
        action: "duplicate",
        success: true,
        message: `Found ${duplicates.length} duplicate groups`,
      });

      res.json({ groups: duplicates.length });
    } catch (error) {
      res.status(500).json({ error: "Failed to scan duplicates" });
    }
  });

  // TV Series endpoints
  app.get("/api/tv-series", async (req, res) => {
    try {
      const series = await storage.getAllTvSeries();
      const mediaItems = await storage.getAllMediaItems();

      // Enrich with episode data
      const enriched = series.map((s) => {
        const seriesEpisodes = mediaItems.filter(
          (item) =>
            item.detectedType === "tvshow" &&
            item.status === "organized" &&
            item.detectedName?.toLowerCase() === s.name.toLowerCase()
        );

        // Group by season
        const seasonsMap: Map<
          number,
          Array<{ id: string; episode: number; filename: string }>
        > = new Map();

        for (const ep of seriesEpisodes) {
          const seasonNum = ep.season || 1;
          if (!seasonsMap.has(seasonNum)) {
            seasonsMap.set(seasonNum, []);
          }
          seasonsMap.get(seasonNum)!.push({
            id: ep.id,
            episode: ep.episode || 0,
            filename: ep.originalFilename,
          });
        }

        const seasons = Array.from(seasonsMap.entries())
          .map(([number, episodes]) => ({
            number,
            episodes: episodes.sort((a, b) => a.episode - b.episode),
          }))
          .sort((a, b) => a.number - b.number);

        return {
          ...s,
          seasons,
        };
      });

      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch TV series" });
    }
  });

  app.delete("/api/tv-series/:id", async (req, res) => {
    try {
      const success = await storage.deleteTvSeries(req.params.id);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Series not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to delete series" });
    }
  });

  // Movies endpoints
  app.get("/api/movies", async (req, res) => {
    try {
      const movies = await storage.getAllMovies();
      res.json(movies);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch movies" });
    }
  });

  app.delete("/api/movies/:id", async (req, res) => {
    try {
      const success = await storage.deleteMovie(req.params.id);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Movie not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to delete movie" });
    }
  });

  // Logs endpoints
  app.get("/api/logs", async (req, res) => {
    try {
      const logs = await storage.getAllLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  });

  // Settings endpoints
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getAllSettings();
      res.json({
        sourcePath: settings.sourcePath || "/Inbox",
        moviesPath: settings.moviesPath || "/Movies",
        tvShowsPath: settings.tvShowsPath || "/TV Shows",
        autoOrganize: settings.autoOrganize === "true",
        removeReleaseGroups: settings.removeReleaseGroups !== "false",
        fuzzyMatchThreshold: parseInt(settings.fuzzyMatchThreshold || "80", 10),
        tmdbApiKey: settings.tmdbApiKey || "",
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const {
        sourcePath,
        moviesPath,
        tvShowsPath,
        autoOrganize,
        removeReleaseGroups,
        fuzzyMatchThreshold,
        tmdbApiKey,
      } = req.body;

      if (sourcePath) await storage.setSetting("sourcePath", sourcePath);
      if (moviesPath) await storage.setSetting("moviesPath", moviesPath);
      if (tvShowsPath) await storage.setSetting("tvShowsPath", tvShowsPath);
      if (autoOrganize !== undefined)
        await storage.setSetting("autoOrganize", String(autoOrganize));
      if (removeReleaseGroups !== undefined)
        await storage.setSetting("removeReleaseGroups", String(removeReleaseGroups));
      if (fuzzyMatchThreshold !== undefined)
        await storage.setSetting("fuzzyMatchThreshold", String(fuzzyMatchThreshold));
      if (tmdbApiKey !== undefined)
        await storage.setSetting("tmdbApiKey", tmdbApiKey);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  // Folder browser endpoint - Jellyfin-style folder picker
  // Browses /host which maps to VPS root filesystem via Docker volume
  // This app runs on user's private VPS (like Jellyfin/Plex)
  app.get("/api/folders", async (req, res) => {
    try {
      const requestedPath = (req.query.path as string) || "/";
      
      // In Docker, VPS root is mounted at /host
      // So /mnt on VPS = /host/mnt in container
      const HOST_PREFIX = "/host";
      const isDocker = fs.existsSync(HOST_PREFIX);

      // Normalize path to prevent traversal attacks
      const normalizedPath = path.normalize(requestedPath).replace(/\/+$/, "") || "/";

      // Strict check: path must not contain traversal patterns
      if (normalizedPath.includes("..")) {
        return res.status(403).json({ error: "Invalid path" });
      }

      // Convert user-facing path to actual filesystem path
      const actualPath = isDocker 
        ? (normalizedPath === "/" ? HOST_PREFIX : HOST_PREFIX + normalizedPath)
        : normalizedPath;

      // If root path requested, list top-level directories
      if (normalizedPath === "/" || normalizedPath === "") {
        const items: { name: string; path: string; isDirectory: boolean }[] = [];
        
        try {
          const rootPath = isDocker ? HOST_PREFIX : "/";
          const entries = fs.readdirSync(rootPath, { withFileTypes: true });
          
          for (const entry of entries) {
            // Skip hidden files and system directories
            if (entry.name.startsWith(".")) continue;
            if (["proc", "sys", "dev", "run", "snap", "boot", "lost+found"].includes(entry.name)) continue;
            if (!entry.isDirectory()) continue;
            
            items.push({
              name: entry.name,
              path: "/" + entry.name,
              isDirectory: true,
            });
          }
        } catch (e) {
          console.error("Error reading root:", e);
        }
        
        items.sort((a, b) => a.name.localeCompare(b.name));
        
        return res.json({
          currentPath: "/",
          parent: null,
          items,
        });
      }

      // Validate path exists
      if (!fs.existsSync(actualPath)) {
        return res.status(404).json({ error: "Path not found" });
      }

      const stat = fs.statSync(actualPath);
      if (!stat.isDirectory()) {
        return res.status(400).json({ error: "Not a directory" });
      }

      // Read directory contents - only show directories (for folder selection)
      const entries = fs.readdirSync(actualPath, { withFileTypes: true });
      const items: { name: string; path: string; isDirectory: boolean }[] = [];

      for (const entry of entries) {
        // Skip hidden files
        if (entry.name.startsWith(".")) continue;
        // Only show directories for folder picker
        if (!entry.isDirectory()) continue;
        
        try {
          const fullPath = path.join(normalizedPath, entry.name);
          items.push({
            name: entry.name,
            path: fullPath,
            isDirectory: true,
          });
        } catch {}
      }

      // Sort alphabetically
      items.sort((a, b) => a.name.localeCompare(b.name));

      const parentPath = path.dirname(normalizedPath);

      res.json({
        currentPath: normalizedPath,
        parent: parentPath !== normalizedPath ? parentPath : null,
        items,
      });
    } catch (error) {
      console.error("Folder browse error:", error);
      res.status(500).json({ error: "Failed to browse folders" });
    }
  });

  // Helper to get TMDB API key (env var takes priority, then settings)
  const getTmdbApiKey = async (): Promise<string | null> => {
    if (TMDB_API_KEY) return TMDB_API_KEY;
    const settings = await storage.getAllSettings();
    return settings.tmdbApiKey || null;
  };

  // TMDB search endpoints
  app.get("/api/tmdb/search/movie", async (req, res) => {
    try {
      const apiKey = await getTmdbApiKey();
      if (!apiKey) {
        return res.status(400).json({ error: "TMDB API key not configured. Set it in Settings." });
      }

      const query = req.query.query as string;
      const year = req.query.year as string | undefined;
      
      if (!query) {
        return res.status(400).json({ error: "Query required" });
      }

      let url = `${TMDB_BASE_URL}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}`;
      if (year) url += `&year=${year}`;

      const response = await fetch(url);
      const data = await response.json();

      const results = (data.results || []).slice(0, 10).map((m: any) => ({
        id: m.id,
        title: m.title,
        originalTitle: m.original_title,
        year: m.release_date?.substring(0, 4) || null,
        overview: m.overview,
        posterPath: m.poster_path ? `https://image.tmdb.org/t/p/w200${m.poster_path}` : null,
        voteAverage: m.vote_average,
      }));

      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to search TMDB" });
    }
  });

  app.get("/api/tmdb/search/tv", async (req, res) => {
    try {
      const apiKey = await getTmdbApiKey();
      if (!apiKey) {
        return res.status(400).json({ error: "TMDB API key not configured. Set it in Settings." });
      }

      const query = req.query.query as string;
      const year = req.query.year as string | undefined;
      
      if (!query) {
        return res.status(400).json({ error: "Query required" });
      }

      let url = `${TMDB_BASE_URL}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}`;
      if (year) url += `&first_air_date_year=${year}`;

      const response = await fetch(url);
      const data = await response.json();

      const results = (data.results || []).slice(0, 10).map((t: any) => ({
        id: t.id,
        title: t.name,
        originalTitle: t.original_name,
        year: t.first_air_date?.substring(0, 4) || null,
        overview: t.overview,
        posterPath: t.poster_path ? `https://image.tmdb.org/t/p/w200${t.poster_path}` : null,
        voteAverage: t.vote_average,
      }));

      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to search TMDB" });
    }
  });

  app.get("/api/tmdb/movie/:id", async (req, res) => {
    try {
      const apiKey = await getTmdbApiKey();
      if (!apiKey) {
        return res.status(400).json({ error: "TMDB API key not configured. Set it in Settings." });
      }

      const url = `${TMDB_BASE_URL}/movie/${req.params.id}?api_key=${apiKey}`;
      const response = await fetch(url);
      const m = await response.json();

      res.json({
        id: m.id,
        title: m.title,
        originalTitle: m.original_title,
        year: m.release_date?.substring(0, 4) || null,
        overview: m.overview,
        posterPath: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
        backdropPath: m.backdrop_path ? `https://image.tmdb.org/t/p/original${m.backdrop_path}` : null,
        runtime: m.runtime,
        genres: m.genres?.map((g: any) => g.name) || [],
        voteAverage: m.vote_average,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch movie details" });
    }
  });

  app.get("/api/tmdb/tv/:id", async (req, res) => {
    try {
      const apiKey = await getTmdbApiKey();
      if (!apiKey) {
        return res.status(400).json({ error: "TMDB API key not configured. Set it in Settings." });
      }

      const url = `${TMDB_BASE_URL}/tv/${req.params.id}?api_key=${apiKey}`;
      const response = await fetch(url);
      const t = await response.json();

      res.json({
        id: t.id,
        title: t.name,
        originalTitle: t.original_name,
        year: t.first_air_date?.substring(0, 4) || null,
        overview: t.overview,
        posterPath: t.poster_path ? `https://image.tmdb.org/t/p/w500${t.poster_path}` : null,
        backdropPath: t.backdrop_path ? `https://image.tmdb.org/t/p/original${t.backdrop_path}` : null,
        numberOfSeasons: t.number_of_seasons,
        numberOfEpisodes: t.number_of_episodes,
        genres: t.genres?.map((g: any) => g.name) || [],
        voteAverage: t.vote_average,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch TV details" });
    }
  });

  return httpServer;
}
