import * as chokidar from "chokidar";
import * as path from "path";
import * as fs from "fs";
import { storage } from "./storage";
import { RELEASE_GROUPS, type MediaType } from "@shared/schema";

const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.m4v', '.webm', '.flv', '.ts', '.m2ts'];
const HOST_PREFIX = "/host";

interface WatcherState {
  isRunning: boolean;
  watchedPaths: string[];
  filesDetected: number;
  filesProcessed: number;
  lastActivity: Date | null;
  errors: string[];
  watcher: chokidar.FSWatcher | null;
}

const state: WatcherState = {
  isRunning: false,
  watchedPaths: [],
  filesDetected: 0,
  filesProcessed: 0,
  lastActivity: null,
  errors: [],
  watcher: null,
};

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
  return parenMatch ? parseInt(parenMatch[1], 10) : null;
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
      return { season: parseInt(match[1], 10), episode: parseInt(match[2], 10) };
    }
  }
  return null;
}

function getExtension(filename: string): string {
  const match = filename.match(/\.[a-zA-Z0-9]{2,4}$/);
  return match ? match[0].toLowerCase() : "";
}

function parseMediaFilename(filename: string) {
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
  const titleCase = (str: string) => str.replace(/\b\w/g, (c) => c.toUpperCase());
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

async function processNewFile(filePath: string, moviesPath: string, tvShowsPath: string) {
  const filename = path.basename(filePath);
  const ext = path.extname(filename).toLowerCase();
  
  if (!VIDEO_EXTENSIONS.includes(ext)) {
    return;
  }

  state.filesDetected++;
  state.lastActivity = new Date();

  try {
    const existing = await storage.getMediaItemByFilename(filename);
    if (existing) {
      return;
    }

    const parsed = parseMediaFilename(filename);
    const destinationPath = generateDestinationPath(parsed, parsed.detectedName, {
      movies: moviesPath,
      tvshows: tvShowsPath,
    });

    const isDocker = fs.existsSync(HOST_PREFIX);
    const userPath = isDocker && filePath.startsWith(HOST_PREFIX) 
      ? filePath.slice(HOST_PREFIX.length) 
      : filePath;

    await storage.createMediaItem({
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

    state.filesProcessed++;

    await storage.createLog({
      action: "auto-detect",
      fromPath: userPath,
      success: true,
      message: `Auto-detected: ${filename}`,
    });

    console.log(`[FileWatcher] New file detected and processed: ${filename}`);
  } catch (error) {
    const errorMsg = `Error processing ${filename}: ${error}`;
    state.errors.push(errorMsg);
    if (state.errors.length > 100) state.errors.shift();
    console.error(`[FileWatcher] ${errorMsg}`);
  }
}

export async function startWatcher(): Promise<{ success: boolean; message: string }> {
  if (state.isRunning && state.watcher) {
    return { success: false, message: "Watcher is already running" };
  }

  const settings = await storage.getAllSettings();
  const isDocker = fs.existsSync(HOST_PREFIX);
  
  let moviesPaths: string[] = [];
  let tvShowsPaths: string[] = [];
  
  if (settings.moviesPaths) {
    try { moviesPaths = JSON.parse(settings.moviesPaths); } 
    catch { moviesPaths = [settings.moviesPaths]; }
  } else if (settings.moviesPath) {
    moviesPaths = [settings.moviesPath];
  }
  
  if (settings.tvShowsPaths) {
    try { tvShowsPaths = JSON.parse(settings.tvShowsPaths); } 
    catch { tvShowsPaths = [settings.tvShowsPaths]; }
  } else if (settings.tvShowsPath) {
    tvShowsPaths = [settings.tvShowsPath];
  }
  
  const allPaths = [...moviesPaths, ...tvShowsPaths].filter(p => p && p.trim());
  
  if (allPaths.length === 0) {
    return { success: false, message: "No library folders configured" };
  }

  const watchPaths = allPaths.map(p => isDocker ? HOST_PREFIX + p : p).filter(p => fs.existsSync(p));
  
  if (watchPaths.length === 0) {
    return { success: false, message: "No accessible folders found" };
  }

  const defaultMoviesPath = moviesPaths[0] || "/Movies";
  const defaultTvShowsPath = tvShowsPaths[0] || "/TV Shows";

  state.watcher = chokidar.watch(watchPaths, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true, // only watch for new files
    awaitWriteFinish: {
      stabilityThreshold: 2000, // wait 2 seconds after file stops changing
      pollInterval: 100,
    },
    depth: 10,
  });

  state.watcher
    .on("add", (filePath) => {
      processNewFile(filePath, defaultMoviesPath, defaultTvShowsPath);
    })
    .on("error", (error) => {
      const errorMsg = `Watcher error: ${error}`;
      state.errors.push(errorMsg);
      console.error(`[FileWatcher] ${errorMsg}`);
    });

  state.isRunning = true;
  state.watchedPaths = allPaths;
  state.filesDetected = 0;
  state.filesProcessed = 0;
  state.errors = [];
  state.lastActivity = null;

  console.log(`[FileWatcher] Started watching ${watchPaths.length} folders`);
  
  await storage.setSetting("monitoringEnabled", "true");
  
  return { success: true, message: `Watching ${allPaths.length} folders` };
}

export async function stopWatcher(): Promise<{ success: boolean; message: string }> {
  if (!state.isRunning || !state.watcher) {
    return { success: false, message: "Watcher is not running" };
  }

  await state.watcher.close();
  state.watcher = null;
  state.isRunning = false;
  
  await storage.setSetting("monitoringEnabled", "false");
  
  console.log("[FileWatcher] Stopped");
  
  return { success: true, message: "Watcher stopped" };
}

export function getWatcherStatus() {
  return {
    isRunning: state.isRunning,
    watchedPaths: state.watchedPaths,
    filesDetected: state.filesDetected,
    filesProcessed: state.filesProcessed,
    lastActivity: state.lastActivity ? state.lastActivity.toISOString() : null,
    recentErrors: state.errors.slice(-5),
  };
}

export async function initWatcher() {
  const settings = await storage.getAllSettings();
  if (settings.monitoringEnabled === "true") {
    console.log("[FileWatcher] Auto-starting watcher from saved settings...");
    await startWatcher();
  }
}
