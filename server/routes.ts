import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { RELEASE_GROUPS, type MediaType } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";
import { startWatcher, stopWatcher, getWatcherStatus, initWatcher } from "./fileWatcher";

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

// Aggressive cleaner for TMDB search - strips ALL junk to get just the title
function cleanForTmdbSearch(filename: string): string {
  let cleaned = filename;
  
  // Remove extension
  cleaned = cleaned.replace(/\.[a-zA-Z0-9]{2,4}$/, "");
  
  // Replace delimiters with spaces
  cleaned = cleaned.replace(/[._\-\[\]]/g, " ");
  
  // Remove content in brackets except years
  cleaned = cleaned.replace(/\((?!(?:19|20)\d{2}\))[^)]*\)/g, " ");
  
  // Comprehensive list of junk patterns to remove (case-insensitive)
  const junkPatterns = [
    // Quality tags
    /\b(720p|1080p|2160p|4k|hd|fhd|uhd|sd)\b/gi,
    /\b(hdtv|webdl|web-dl|webrip|web|bluray|bdrip|brrip|dvdrip|hdrip|hdtc|hdts|hdcam|cam|ts|tc|r5|dvdscr|screener|pre)\b/gi,
    /\b(remux|proper|repack|internal|real|extended|uncut|unrated|theatrical|directors?\.?cut)\b/gi,
    
    // Video codecs
    /\b(x264|x265|h\.?264|h\.?265|hevc|avc|xvid|divx|10bit|8bit|hdr|hdr10|sdr|dv|dolby\.?vision)\b/gi,
    
    // Audio codecs and channels
    /\b(aac|ac3|dts|dts-hd|truehd|atmos|flac|mp3|eac3)\b/gi,
    /\b(ddp?5?\.?1|dd5?\.?1|dd2?\.?0|5\.1|7\.1|2\.0|dts-x)\b/gi,
    /\b(ddp|ddpa|dts|dd)\d*\.?\d*\b/gi,
    
    // Streaming services
    /\b(amzn|amazon|nf|netflix|hmax|hbo|dsnp|disney\+?|atvp|apple|pcok|peacock|hulu|max|hotstar|hs|jhs|zee5|sonyliv|jio|voot|mxplayer)\b/gi,
    
    // Languages (remove these from search query, not the whole filename)
    /\b(hindi|english|tamil|telugu|malayalam|kannada|bengali|marathi|punjabi|gujarati|spanish|french|german|italian|japanese|korean|chinese|russian|portuguese|arabic|thai|vietnamese|indonesian|dutch|polish|turkish|swedish|norwegian|danish|finnish|greek|hebrew|hungarian|czech|romanian|ukrainian|persian|urdu)\b/gi,
    /\b(hin|eng|tam|tel|mal|kan|ben|mar|pun|chi|kor|jap|spa|fre|ger|ita|rus|por|ara|tha|vie|ind|dut|pol|tur|swe|nor|dan|fin|gre|heb|hun|cze|rom|ukr|per|urd)\b/gi,
    /\b(dual|multi|dual-audio|multi-audio)\b/gi,
    
    // Subtitles
    /\b(esub|esubs|subs?|subtitles?|hcsub|hc|msub|msubs|subtitled)\b/gi,
    
    // Release groups and uploaders
    /\b(yts|yify|rarbg|eztv|ettv|lol|dimension|sparks|ntg|ntb|flux|phoenix|ggez|ggwp|gossip|cmrg|sigma|mkvcage|pahe|psa|tepes|hone|evo|fgt|galactica|memento|syncopy|nogrp|ion10|playwave|frds|npms|successors|telly|cakes|glhf|deejayahmed|hdhub4u|kingdom|katmoviehd|grab|ms|tv|rg)\b/gi,
    
    // Quality indicators
    /\b(hq|lq|line|clear|proper|clean)\b/gi,
    
    // Common junk
    /\b(www|com|org|net|to|in|me|cc|ws|sx)\b/gi,
    /\b(v2|v3|v4)\b/gi,
    /\baka\b/gi,
  ];
  
  for (const pattern of junkPatterns) {
    cleaned = cleaned.replace(pattern, " ");
  }
  
  // Remove standalone numbers that look like audio channels or quality
  cleaned = cleaned.replace(/\b\d+\s*\d*\s*\b/g, (match) => {
    // Keep years, remove everything else
    if (/^(19|20)\d{2}$/.test(match.trim())) return match;
    return " ";
  });
  
  // Clean up multiple spaces and trim
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  
  // Remove leading/trailing punctuation
  cleaned = cleaned.replace(/^[\s\-\.,]+|[\s\-\.,]+$/g, "");
  
  // Remove empty parentheses or malformed ones
  cleaned = cleaned.replace(/\(\s*\)/g, "");
  cleaned = cleaned.replace(/\(\s*\(/g, "(");
  cleaned = cleaned.replace(/\)\s*\)/g, ")");
  
  return cleaned;
}

// Extract just the title words (first few meaningful words before junk)
function extractTitleForSearch(cleanedName: string): string {
  // Split into words
  const words = cleanedName.split(/\s+/);
  
  // Take words until we hit a year or max 6 words
  const titleWords: string[] = [];
  for (const word of words) {
    // Stop at year
    if (/^\(?(19|20)\d{2}\)?$/.test(word)) break;
    // Stop at empty or very short words that might be junk
    if (word.length < 2) continue;
    // Skip numbers unless they look like part of title (like "2" in "Iron Man 2")
    if (/^\d+$/.test(word) && titleWords.length === 0) continue;
    
    titleWords.push(word);
    
    // Max 6 words for title
    if (titleWords.length >= 6) break;
  }
  
  return titleWords.join(" ").trim();
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

// Token-based parser: strips quality tags, release groups, and extracts core name
function tokenizeFilename(filename: string): string[] {
  // Remove extension
  let name = filename.replace(/\.[a-zA-Z0-9]{2,4}$/, "");
  // Replace delimiters with spaces
  name = name.replace(/[._\-\[\]()]/g, " ");
  // Split into tokens
  return name.split(/\s+/).filter(t => t.length > 0);
}

// Quality and release tags to remove (all lowercase for normalized comparison)
const QUALITY_TAGS = new Set([
  '720p', '1080p', '2160p', '4k', 'hdtv', 'web', 'webrip', 'webdl', 'web-dl',
  'bluray', 'brrip', 'bdrip', 'dvdrip', 'hdrip', 'hdtvrip',
  'x264', 'x265', 'hevc', 'h264', 'h265', 'avc',
  'aac', 'ac3', 'dts', 'ddp', 'ddp5', 'dd5', 'ddp51', 'atmos', 'truehd',
  'proper', 'repack', 'internal', 'readnfo', 'extended', 'uncut', 'unrated',
  '10bit', '8bit', 'hdr', 'hdr10', 'sdr', 'dv', 'dolby', 'vision',
  'amzn', 'nf', 'hmax', 'dsnp', 'atvp', 'pcok', 'hulu', 'max',
  // Release groups / uploaders
  'telly', 'yts', 'rarbg', 'eztv', 'ettv', 'lol', 'dimension', 'sparks',
  'ntg', 'ntb', 'flux', 'phoenix', 'ggez', 'ggwp', 'cakes', 'gossip', 
  'glhf', 'cmrg', 'sigma', 'mkvcage', 'pahe', 'psa', 'tepes',
  'successors', 'hone', 'evo', 'fgt', 'yify', 'galactica', 'memento',
  'syncopy', 'nogrp', 'ion10', 'playwave', 'frds', 'npms', 'deejayahmed'
]);

// Normalize token for quality tag matching (remove dots, lowercase)
function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[.\-]/g, '');
}

// Check if token is a quality/release tag
function isQualityTag(token: string): boolean {
  const normalized = normalizeToken(token);
  return QUALITY_TAGS.has(normalized);
}

// Get tokens before any S01E01 pattern or quality tags
function extractSeriesTokens(tokens: string[]): string[] {
  const result: string[] = [];
  let hasNonNumericToken = false;
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const lower = token.toLowerCase();
    const isNumeric = /^\d+$/.test(token);
    
    // Stop at S01E01 pattern
    if (/^s\d{1,2}e\d{1,3}$/i.test(token)) break;
    // Stop at season marker
    if (/^s\d{1,2}$/i.test(token)) break;
    // Stop at 1x01 pattern
    if (/^\d{1,2}x\d{1,3}$/i.test(token)) break;
    
    // Skip leading quality/release tags (before we have real title tokens)
    const isReleaseGroup = RELEASE_GROUPS.some(g => lower === g.toLowerCase());
    if (!hasNonNumericToken && (isQualityTag(token) || isReleaseGroup)) continue;
    
    // Stop at quality/release tags (after we have title tokens)
    if (hasNonNumericToken && isQualityTag(token)) break;
    // Stop at year in parentheses style (only after we have title tokens)
    if (/^(19|20)\d{2}$/.test(token) && hasNonNumericToken) break;
    // Stop at release group patterns (only after we have title tokens)
    if (hasNonNumericToken && isReleaseGroup) break;
    // Stop at pure numbers that look like episode numbers (only after we have non-numeric tokens)
    if (isNumeric && hasNonNumericToken && parseInt(token) <= 50) break;
    
    if (!isNumeric) hasNonNumericToken = true;
    result.push(token);
  }
  
  return result;
}

// Find longest common prefix of token arrays
function longestCommonPrefix(tokenArrays: string[][]): string[] {
  if (tokenArrays.length === 0) return [];
  if (tokenArrays.length === 1) return tokenArrays[0];
  
  const first = tokenArrays[0];
  const result: string[] = [];
  
  for (let i = 0; i < first.length; i++) {
    const token = first[i].toLowerCase();
    let allMatch = true;
    
    for (let j = 1; j < tokenArrays.length; j++) {
      if (i >= tokenArrays[j].length || tokenArrays[j][i].toLowerCase() !== token) {
        allMatch = false;
        break;
      }
    }
    
    if (allMatch) {
      result.push(first[i]);
    } else {
      break;
    }
  }
  
  return result;
}

// Extract series name from filename (single file)
function extractSeriesName(filename: string): string {
  const tokens = tokenizeFilename(filename);
  const seriesTokens = extractSeriesTokens(tokens);
  
  if (seriesTokens.length > 0) {
    // Title case
    return seriesTokens.map(t => 
      t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
    ).join(" ");
  }
  
  return cleanFilename(filename);
}

// Batch consensus: find series name from multiple filenames
// Only returns consensus if high overlap across files (avoids mixed directory issues)
function findSeriesNameByConsensus(filenames: string[]): string | null {
  if (filenames.length < 2) return null;
  
  const tokenArrays = filenames.map(f => {
    const tokens = tokenizeFilename(f);
    return extractSeriesTokens(tokens);
  }).filter(t => t.length > 0);
  
  if (tokenArrays.length < 2) return null;
  
  const commonPrefix = longestCommonPrefix(tokenArrays);
  if (commonPrefix.length < 2) return null;
  
  // Validation: need at least 1 non-numeric word for a valid series name
  // (keeps numeric tokens like "3" in "3 Body Problem")
  const nonNumericCount = commonPrefix.filter(t => !/^\d+$/.test(t)).length;
  if (nonNumericCount < 1) return null;
  
  // Guard: only use consensus if at least 70% of files share this prefix
  // This prevents applying wrong names to mixed directories
  const minOverlap = Math.ceil(tokenArrays.length * 0.7);
  let matchCount = 0;
  
  for (const tokens of tokenArrays) {
    let matches = true;
    for (let i = 0; i < commonPrefix.length; i++) {
      if (i >= tokens.length || tokens[i].toLowerCase() !== commonPrefix[i].toLowerCase()) {
        matches = false;
        break;
      }
    }
    if (matches) matchCount++;
  }
  
  if (matchCount < minOverlap) return null;
  
  // Build series name from ALL prefix tokens (including numeric ones like "3")
  const seriesName = commonPrefix.map(t => 
    /^\d+$/.test(t) ? t : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
  ).join(" ");
  
  // Guard: series name should be at least 3 characters total
  if (seriesName.length < 3) return null;
  
  return seriesName;
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

    // Use improved series name extraction
    detectedName = extractSeriesName(filename);
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

// Helper: normalize series name for consistent matching
function normalizeSeriesName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

// Helper: get canonical series folder name (returns just the folder name, not full path)
async function getCanonicalSeriesFolder(
  detectedName: string,
  year: number | null
): Promise<string> {
  const normalizedInput = normalizeSeriesName(detectedName);
  
  // Check if we have an existing TV series with matching name
  const existingSeries = await storage.getAllTvSeries();
  
  for (const series of existingSeries) {
    const normalizedExisting = normalizeSeriesName(series.name);
    
    // Check for match (with some fuzzy tolerance)
    if (normalizedInput === normalizedExisting || 
        normalizedInput.includes(normalizedExisting) || 
        normalizedExisting.includes(normalizedInput)) {
      // Reuse existing folder name if available (just the folder name, not full path)
      if (series.folderPath) {
        // folderPath stores just the folder name like "Ashram (2020)"
        return series.folderPath;
      }
      // Otherwise use existing series name for consistency
      const yearStr = series.year ? ` (${series.year})` : "";
      return `${series.name}${yearStr}`;
    }
  }
  
  // No existing series found, create new folder name
  const titleCase = (str: string) =>
    str.replace(/\b\w/g, (c) => c.toUpperCase());
  const formattedName = titleCase(detectedName);
  const yearStr = year ? ` (${year})` : "";
  return `${formattedName}${yearStr}`;
}

// Helper: Move file to destination with folder creation
async function moveFileToDestination(
  sourcePath: string,
  destinationPath: string,
  isDocker: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    // In Docker, paths need HOST_PREFIX for actual filesystem access
    const HOST_PREFIX = "/host";
    const actualSource = isDocker ? `${HOST_PREFIX}${sourcePath}` : sourcePath;
    const actualDest = isDocker ? `${HOST_PREFIX}${destinationPath}` : destinationPath;
    
    // Check if source exists
    try {
      await fs.promises.access(actualSource, fs.constants.R_OK);
    } catch {
      return { success: false, error: `Source file not found: ${sourcePath}` };
    }
    
    // Create destination directory
    const destDir = path.dirname(actualDest);
    await fs.promises.mkdir(destDir, { recursive: true });
    
    // Check if destination already exists
    try {
      await fs.promises.access(actualDest);
      return { success: false, error: `Destination already exists: ${destinationPath}` };
    } catch {
      // Good - destination doesn't exist
    }
    
    // Move file (rename if same filesystem, copy+delete otherwise)
    try {
      await fs.promises.rename(actualSource, actualDest);
    } catch (renameErr: any) {
      // If rename fails (cross-device), copy then delete with verification
      if (renameErr.code === 'EXDEV') {
        // Get source file size before copy
        const sourceStats = await fs.promises.stat(actualSource);
        const sourceSize = sourceStats.size;
        
        // Copy file
        await fs.promises.copyFile(actualSource, actualDest);
        
        // Verify destination exists and has same size
        try {
          const destStats = await fs.promises.stat(actualDest);
          if (destStats.size !== sourceSize) {
            // Copy failed - remove incomplete destination, keep source
            await fs.promises.unlink(actualDest).catch(() => {});
            return { success: false, error: `Copy verification failed: size mismatch (source: ${sourceSize}, dest: ${destStats.size})` };
          }
        } catch (verifyErr) {
          return { success: false, error: `Copy verification failed: destination not accessible` };
        }
        
        // Only delete source after verified copy
        await fs.promises.unlink(actualSource);
      } else {
        throw renameErr;
      }
    }
    
    // Final verification - ensure destination exists
    try {
      await fs.promises.access(actualDest, fs.constants.R_OK);
    } catch {
      return { success: false, error: `Move failed: destination not accessible after move` };
    }
    
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown error' };
  }
}

// Helper: Delete empty folders after file move (up to root boundary)
async function cleanupEmptyFolders(
  filePath: string,
  rootBoundaries: string[],
  isDocker: boolean = false
): Promise<string[]> {
  const deletedFolders: string[] = [];
  const HOST_PREFIX = "/host";
  
  try {
    let currentDir = path.dirname(filePath);
    const actualRoot = isDocker ? HOST_PREFIX : "";
    
    // Normalize root boundaries
    const normalizedRoots = rootBoundaries.map(r => 
      path.normalize(r).replace(/\/$/, "")
    );
    
    while (currentDir && currentDir !== "/" && currentDir !== ".") {
      // Check if we hit a root boundary
      const normalizedCurrent = path.normalize(currentDir).replace(/\/$/, "");
      if (normalizedRoots.some(root => normalizedCurrent === root || normalizedCurrent.endsWith(root))) {
        break;
      }
      
      const actualDir = isDocker ? `${HOST_PREFIX}${currentDir}` : currentDir;
      
      try {
        const contents = await fs.promises.readdir(actualDir);
        if (contents.length === 0) {
          await fs.promises.rmdir(actualDir);
          deletedFolders.push(currentDir);
          currentDir = path.dirname(currentDir);
        } else {
          break; // Folder not empty
        }
      } catch {
        break; // Can't read or delete
      }
    }
  } catch (err) {
    console.error("Error cleaning up folders:", err);
  }
  
  return deletedFolders;
}

// TMDB lookup cache (in-memory for current session)
const tmdbCache = new Map<string, { id: number; name: string; year: number | null; posterPath: string | null }>();

// Helper: Search TMDB for canonical name
async function lookupTmdb(
  name: string,
  type: "movie" | "tvshow",
  year: number | null
): Promise<{ id: number; name: string; year: number | null; posterPath: string | null } | null> {
  // First, clean the name aggressively for TMDB search
  const cleanedName = cleanForTmdbSearch(name);
  const searchQuery = extractTitleForSearch(cleanedName);
  
  console.log(`[TMDB] Original: "${name}" -> Cleaned: "${cleanedName}" -> Search: "${searchQuery}"`);
  
  if (!searchQuery || searchQuery.length < 2) {
    console.log(`[TMDB] Search query too short, skipping`);
    return null;
  }
  
  const cacheKey = `${type}:${searchQuery.toLowerCase()}:${year || ""}`;
  
  if (tmdbCache.has(cacheKey)) {
    return tmdbCache.get(cacheKey)!;
  }
  
  // Try env var first, then settings
  let apiKey = TMDB_API_KEY;
  if (!apiKey) {
    try {
      const settings = await storage.getAllSettings();
      apiKey = settings.tmdbApiKey || null;
    } catch {
      apiKey = null;
    }
  }
  if (!apiKey) return null;
  
  try {
    const endpoint = type === "movie" ? "movie" : "tv";
    
    // Try with year first
    let url = `${TMDB_BASE_URL}/search/${endpoint}?api_key=${apiKey}&query=${encodeURIComponent(searchQuery)}`;
    if (year) {
      url += type === "movie" ? `&year=${year}` : `&first_air_date_year=${year}`;
    }
    
    let response = await fetch(url);
    let data = response.ok ? await response.json() : null;
    
    // If no results with year, try without year
    if ((!data?.results || data.results.length === 0) && year) {
      console.log(`[TMDB] No results with year ${year}, trying without year`);
      url = `${TMDB_BASE_URL}/search/${endpoint}?api_key=${apiKey}&query=${encodeURIComponent(searchQuery)}`;
      response = await fetch(url);
      data = response.ok ? await response.json() : null;
    }
    
    if (!data?.results || data.results.length === 0) {
      console.log(`[TMDB] No results for "${searchQuery}"`);
      return null;
    }
    
    const result = data.results[0];
    const tmdbResult = {
      id: result.id,
      name: type === "movie" ? result.title : result.name,
      year: type === "movie" 
        ? (result.release_date ? parseInt(result.release_date.substring(0, 4)) : null)
        : (result.first_air_date ? parseInt(result.first_air_date.substring(0, 4)) : null),
      posterPath: result.poster_path ? `https://image.tmdb.org/t/p/w342${result.poster_path}` : null
    };
    
    console.log(`[TMDB] Found: "${tmdbResult.name}" (${tmdbResult.year}) poster: ${tmdbResult.posterPath ? 'yes' : 'no'}`);
    tmdbCache.set(cacheKey, tmdbResult);
    return tmdbResult;
  } catch (err) {
    console.error("[TMDB] Lookup error:", err);
    return null;
  }
}

async function generateDestinationPath(
  parsed: ReturnType<typeof parseMediaFilename>,
  detectedName: string,
  basePaths: { movies: string; tvshows: string },
  tmdbName?: string | null,
  tmdbYear?: number | null
): Promise<string> {
  const { detectedType, year, season, episode, extension } = parsed;

  const titleCase = (str: string) =>
    str.replace(/\b\w/g, (c) => c.toUpperCase());

  // Use TMDB name if available, otherwise use detected name
  const canonicalName = tmdbName || titleCase(detectedName);
  const canonicalYear = tmdbYear || year;
  const yearStr = canonicalYear ? ` (${canonicalYear})` : "";

  if (detectedType === "movie") {
    const folderName = `${canonicalName}${yearStr}`;
    const fileName = `${canonicalName}${yearStr}${extension}`;
    return `${basePaths.movies}/${folderName}/${fileName}`;
  }

  if (detectedType === "tvshow" && season !== null && episode !== null) {
    // Use TMDB name for folder, or get canonical from existing series
    let seriesFolder: string;
    if (tmdbName) {
      seriesFolder = `${tmdbName}${yearStr}`;
    } else {
      seriesFolder = await getCanonicalSeriesFolder(detectedName, year);
    }
    
    const seasonFolder = `Season ${season.toString().padStart(2, "0")}`;
    const episodeStr = `S${season.toString().padStart(2, "0")}E${episode.toString().padStart(2, "0")}`;
    
    // Extract just the series name for the filename
    const seriesNameForFile = seriesFolder.replace(/\s*\(\d{4}\)$/, "");
    const fileName = `${seriesNameForFile} - ${episodeStr}${extension}`;
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

  // Media Items endpoints - with pagination
  app.get("/api/media-items", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;
      
      const allItems = await storage.getAllMediaItems();
      const total = allItems.length;
      const items = allItems.slice(offset, offset + limit);
      
      res.json({
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        }
      });
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

  // Refresh status - check all pending items and auto-update if already organized
  app.post("/api/media-items/refresh-status", async (req, res) => {
    try {
      const isDocker = fs.existsSync("/host");
      const HOST_PREFIX = "/host";
      
      const pendingItems = await storage.getPendingMediaItems();
      let updated = 0;
      let removed = 0;
      
      for (const item of pendingItems) {
        if (!item.originalPath || !item.destinationPath) continue;
        
        const actualSource = isDocker ? `${HOST_PREFIX}${item.originalPath}` : item.originalPath;
        const actualDest = isDocker ? `${HOST_PREFIX}${item.destinationPath}` : item.destinationPath;
        
        // If source doesn't exist but destination does, mark as organized
        if (!fs.existsSync(actualSource) && fs.existsSync(actualDest)) {
          await storage.updateMediaItem(item.id, { 
            status: "organized", 
            originalPath: item.destinationPath 
          });
          updated++;
        }
        // If neither source nor destination exist, remove from database
        else if (!fs.existsSync(actualSource) && !fs.existsSync(actualDest)) {
          await storage.deleteMediaItem(item.id);
          removed++;
        }
      }
      
      res.json({ 
        message: `Refreshed status: ${updated} items marked as organized, ${removed} orphan entries removed`,
        updated,
        removed
      });
    } catch (error) {
      console.error("Refresh status error:", error);
      res.status(500).json({ error: "Failed to refresh status" });
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

        const destinationPath = await generateDestinationPath(parsed, parsed.detectedName, {
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

  // Background scan job system
  const BATCH_SIZE = 50; // Process 50 files at a time
  const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.m4v', '.webm', '.flv', '.ts', '.m2ts'];
  const HOST_PREFIX = "/host";

  // Find all video files (lightweight - just collects paths)
  const findVideoFilesAsync = async (dir: string): Promise<string[]> => {
    const files: string[] = [];
    const queue = [dir];
    
    while (queue.length > 0) {
      const currentDir = queue.shift()!;
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            queue.push(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (VIDEO_EXTENSIONS.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (e) {
        // Skip unreadable directories
      }
    }
    return files;
  };

  // Process files in background with chunking
  const runBackgroundScan = async (jobId: string, allPaths: string[], defaultMoviesPath: string, defaultTvShowsPath: string) => {
    const isDocker = fs.existsSync(HOST_PREFIX);
    let totalFiles = 0;
    let processedFiles = 0;
    let newItems = 0;
    
    try {
      await storage.updateScanJob(jobId, { status: "running" });

      // First pass: count all files
      const allVideoFiles: Array<{filePath: string, sourcePath: string}> = [];
      
      for (const sourcePath of allPaths) {
        const actualPath = isDocker ? HOST_PREFIX + sourcePath : sourcePath;
        if (!fs.existsSync(actualPath)) continue;
        
        await storage.updateScanJob(jobId, { currentFolder: sourcePath });
        const files = await findVideoFilesAsync(actualPath);
        
        for (const filePath of files) {
          allVideoFiles.push({ filePath, sourcePath });
        }
      }
      
      totalFiles = allVideoFiles.length;
      await storage.updateScanJob(jobId, { totalFiles });

      // Group files by parent directory for consensus-based naming
      const filesByDir: Record<string, Array<{filePath: string, sourcePath: string}>> = {};
      for (const file of allVideoFiles) {
        const dir = path.dirname(file.filePath);
        if (!filesByDir[dir]) filesByDir[dir] = [];
        filesByDir[dir].push(file);
      }

      // Process each directory group
      for (const dir of Object.keys(filesByDir)) {
        const dirFiles = filesByDir[dir];
        // Get filenames for consensus detection
        const filenames = dirFiles.map((f: {filePath: string, sourcePath: string}) => path.basename(f.filePath));
        
        // Try to find consensus series name for TV shows in this directory
        const consensusName = findSeriesNameByConsensus(filenames);
        
        // Process files in this directory
        for (let i = 0; i < dirFiles.length; i += BATCH_SIZE) {
          const batch = dirFiles.slice(i, i + BATCH_SIZE);
          
          for (const { filePath, sourcePath } of batch) {
            const filename = path.basename(filePath);
            const userPath = isDocker ? filePath.replace(HOST_PREFIX, '') : filePath;
            
            // Check if already exists in database BY PATH (not just filename)
            const existingByPath = await storage.getMediaItemByPath(userPath);
            if (existingByPath) {
              console.log(`[Scan] File already in DB by path: ${userPath}, status: ${existingByPath.status}`);
              processedFiles++;
              continue;
            }
            
            // Also check by destination path in case it was organized
            const existingByFilename = await storage.getMediaItemByFilename(filename);
            if (existingByFilename && existingByFilename.originalPath === userPath) {
              console.log(`[Scan] File already in DB by filename+path: ${filename}`);
              processedFiles++;
              continue;
            }

            const parsed = parseMediaFilename(filename);
            
            // If this is a TV show and we have consensus, use consensus name
            let detectedName = parsed.detectedName;
            let confidence = parsed.confidence;
            if (parsed.detectedType === "tvshow" && consensusName && consensusName.length >= 3) {
              detectedName = consensusName;
              confidence = Math.min(confidence + 15, 100); // Boost confidence for consensus
            }
            
            // TMDB lookup for canonical naming
            let tmdbId: number | null = null;
            let tmdbName: string | null = null;
            let tmdbYear: number | null = null;
            let posterPath: string | null = null;
            
            if (parsed.detectedType !== "unknown") {
              const tmdbResult = await lookupTmdb(
                detectedName, 
                parsed.detectedType, 
                parsed.year
              );
              if (tmdbResult) {
                tmdbId = tmdbResult.id;
                tmdbName = tmdbResult.name;
                tmdbYear = tmdbResult.year;
                posterPath = tmdbResult.posterPath;
                confidence = Math.min(confidence + 10, 100); // Boost for TMDB match
              }
            }
            
            const destinationPath = await generateDestinationPath(
              parsed, 
              detectedName, 
              { movies: defaultMoviesPath, tvshows: defaultTvShowsPath },
              tmdbName,
              tmdbYear
            );

            // Check if file already exists at destination
            if (destinationPath) {
              const actualDestPath = isDocker ? `${HOST_PREFIX}${destinationPath}` : destinationPath;
              const destExists = fs.existsSync(actualDestPath);
              console.log(`[Scan] File: ${filename}, Dest: ${actualDestPath}, Exists: ${destExists}`);
              if (destExists) {
                // Check if source path equals destination path (truly organized)
                // Or if source is different (duplicate/unorganized copy)
                const normalizedSource = userPath.replace(/\/+/g, '/');
                const normalizedDest = destinationPath.replace(/\/+/g, '/');
                
                if (normalizedSource === normalizedDest) {
                  // File IS at its correct destination - truly organized
                  console.log(`[Scan] File at correct destination - adding as organized: ${filename}`);
                  const finalName = tmdbName || detectedName;
                  const finalYear = tmdbYear || parsed.year;
                
                  await storage.createMediaItem({
                    originalFilename: filename,
                    originalPath: destinationPath,
                    extension: parsed.extension,
                    detectedType: parsed.detectedType,
                    detectedName: finalName,
                    cleanedName: parsed.cleanedName,
                    tmdbId: tmdbId,
                    tmdbName: tmdbName,
                    posterPath: posterPath,
                    year: finalYear,
                    season: parsed.season,
                    episode: parsed.episode,
                    status: "organized",
                    destinationPath,
                    confidence: confidence,
                  });
                  
                  // Also create TV Series or Movie entry for library display
                  if (parsed.detectedType === "movie" && finalName) {
                    const existingMovie = await storage.getMovieByName(finalName);
                    if (!existingMovie) {
                      await storage.createMovie({
                        name: finalName,
                        cleanedName: parsed.cleanedName || finalName,
                        year: finalYear,
                        filePath: destinationPath,
                        tmdbId: tmdbId,
                        posterPath: posterPath,
                      });
                      console.log(`[Scan] Created movie entry: ${finalName}`);
                    }
                  } else if (parsed.detectedType === "tvshow" && finalName) {
                    const pathParts = destinationPath?.split("/").filter(Boolean) || [];
                    const seriesFolderName = pathParts.length >= 2 ? pathParts[1] : null;
                    
                    let series = await storage.getTvSeriesByName(finalName);
                    if (!series) {
                      series = await storage.createTvSeries({
                        name: finalName,
                        cleanedName: parsed.cleanedName || finalName,
                        year: finalYear,
                        totalSeasons: parsed.season || 1,
                        totalEpisodes: 1,
                        folderPath: seriesFolderName,
                        tmdbId: tmdbId,
                        posterPath: posterPath,
                      });
                      console.log(`[Scan] Created TV series: ${finalName}`);
                    } else {
                      await storage.updateTvSeries(series.id, {
                        totalSeasons: Math.max(series.totalSeasons || 0, parsed.season || 0),
                        totalEpisodes: (series.totalEpisodes || 0) + 1,
                        folderPath: series.folderPath || seriesFolderName,
                      });
                      console.log(`[Scan] Updated TV series: ${finalName}, episodes: ${(series.totalEpisodes || 0) + 1}`);
                    }
                  }
                  
                  newItems++;
                  processedFiles++;
                  continue;
                } else {
                  // Source path is DIFFERENT from destination - this is an UNORGANIZED duplicate!
                  // File exists at destination but this source copy is somewhere else
                  console.log(`[Scan] DUPLICATE found - source: ${userPath}, dest exists at: ${destinationPath}`);
                  // Add as "duplicate" so user can see it and decide what to do
                  await storage.createMediaItem({
                    originalFilename: filename,
                    originalPath: userPath,
                    extension: parsed.extension,
                    detectedType: parsed.detectedType,
                    detectedName: tmdbName || detectedName,
                    cleanedName: parsed.cleanedName,
                    tmdbId: tmdbId,
                    tmdbName: tmdbName,
                    posterPath: posterPath,
                    year: tmdbYear || parsed.year,
                    season: parsed.season,
                    episode: parsed.episode,
                    status: "duplicate",
                    destinationPath,
                    confidence: confidence,
                  });
                  newItems++;
                  processedFiles++;
                  continue;
                }
              }
            }

            await storage.createMediaItem({
              originalFilename: filename,
              originalPath: userPath,
              extension: parsed.extension,
              detectedType: parsed.detectedType,
              detectedName: tmdbName || detectedName,
              cleanedName: parsed.cleanedName,
              tmdbId: tmdbId,
              tmdbName: tmdbName,
              posterPath: posterPath,
              year: tmdbYear || parsed.year,
              season: parsed.season,
              episode: parsed.episode,
              status: "pending",
              destinationPath,
              confidence: confidence,
            });

            newItems++;
            processedFiles++;
          }
          
          // Update progress after each batch
          await storage.updateScanJob(jobId, { processedFiles, newItems });
          
          // Small delay to prevent CPU spike
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      await storage.updateScanJob(jobId, { 
        status: "completed", 
        completedAt: new Date(),
        processedFiles: totalFiles,
        newItems,
        currentFolder: null 
      });

      await storage.createLog({
        action: "scan-folder",
        success: true,
        message: `Background scan complete: ${totalFiles} files processed, ${newItems} new items`,
      });

    } catch (error) {
      console.error("Background scan error:", error);
      await storage.updateScanJob(jobId, { 
        status: "failed", 
        error: String(error),
        completedAt: new Date() 
      });
    }
  };

  // Start a new scan job
  app.post("/api/scan-folder", async (req, res) => {
    try {
      // Check if scan already running
      const activeJob = await storage.getActiveScanJob();
      if (activeJob) {
        return res.json({ 
          jobId: activeJob.id, 
          status: activeJob.status,
          message: "Scan already in progress"
        });
      }

      const settings = await storage.getAllSettings();
      
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
        return res.status(400).json({ 
          error: "No library folders configured. Please add folders in Settings." 
        });
      }

      // Create job and respond immediately
      const job = await storage.createScanJob({
        status: "pending",
        totalFiles: 0,
        processedFiles: 0,
        newItems: 0,
      });

      // Use separate destination paths (not source paths)
      const moviesDestination = settings.moviesDestination || "";
      const tvShowsDestination = settings.tvShowsDestination || "";

      // CRITICAL: Block scan if no destination paths configured
      if (!moviesDestination && !tvShowsDestination) {
        return res.status(400).json({ 
          error: "Destination paths not configured. Please set 'Movies Destination' and 'TV Shows Destination' in Settings before scanning." 
        });
      }

      // Start background scan (non-blocking)
      setImmediate(() => {
        runBackgroundScan(job.id, allPaths, moviesDestination, tvShowsDestination);
      });

      res.json({ 
        jobId: job.id, 
        status: "pending",
        message: "Scan started in background"
      });
    } catch (error) {
      console.error("Scan folder error:", error);
      res.status(500).json({ error: "Failed to start scan" });
    }
  });

  // Get scan job status
  app.get("/api/scan-jobs/:id", async (req, res) => {
    try {
      const job = await storage.getScanJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      res.status(500).json({ error: "Failed to get scan job" });
    }
  });

  // Get active scan job
  app.get("/api/scan-jobs/active", async (req, res) => {
    try {
      const job = await storage.getActiveScanJob();
      res.json(job || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to get active scan job" });
    }
  });

  // File Watcher / Monitoring endpoints
  app.get("/api/monitoring/status", async (req, res) => {
    try {
      const status = getWatcherStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: "Failed to get monitoring status" });
    }
  });

  app.post("/api/monitoring/start", async (req, res) => {
    try {
      const result = await startWatcher();
      res.json(result);
    } catch (error) {
      console.error("Start monitoring error:", error);
      res.status(500).json({ success: false, message: "Failed to start monitoring" });
    }
  });

  app.post("/api/monitoring/stop", async (req, res) => {
    try {
      const result = await stopWatcher();
      res.json(result);
    } catch (error) {
      console.error("Stop monitoring error:", error);
      res.status(500).json({ success: false, message: "Failed to stop monitoring" });
    }
  });

  // Initialize file watcher on startup (if enabled)
  initWatcher().catch(err => console.error("Failed to init watcher:", err));

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

  // Organize endpoint - actually moves files to destination
  // dryRun=true will only verify paths without moving
  // Uses chunked processing to avoid system crashes with large batches
  app.post("/api/organize", async (req, res) => {
    try {
      const { ids, dryRun = false } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: "ids must be an array" });
      }

      // Check if destination paths are configured
      const settings = await storage.getAllSettings();
      const moviesDestination = settings.moviesDestination || "";
      const tvShowsDestination = settings.tvShowsDestination || "";
      
      if (!moviesDestination && !tvShowsDestination) {
        return res.status(400).json({ 
          error: "Destination paths not configured. Please set Movies Destination and TV Shows Destination in Settings first." 
        });
      }

      // Detect if running in Docker
      const isDocker = fs.existsSync("/host");
      const HOST_PREFIX = "/host";
      
      const organized: any[] = [];
      const failed: any[] = [];
      
      // Chunked processing to prevent system overload
      const CHUNK_SIZE = 10; // Process 10 files at a time
      const CHUNK_DELAY = 200; // 200ms delay between chunks
      
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      
      console.log(`[Organize] Starting organization of ${ids.length} files in chunks of ${CHUNK_SIZE}`);

      for (let chunkStart = 0; chunkStart < ids.length; chunkStart += CHUNK_SIZE) {
        const chunk = ids.slice(chunkStart, chunkStart + CHUNK_SIZE);
        console.log(`[Organize] Processing chunk ${Math.floor(chunkStart / CHUNK_SIZE) + 1}/${Math.ceil(ids.length / CHUNK_SIZE)}`);
        
        // Process files in chunk sequentially to avoid concurrent file operations
        for (const id of chunk) {
        const item = await storage.getMediaItemById(id);
        if (!item) continue;
        if (!item.originalPath || !item.destinationPath) {
          failed.push({ id, error: "Missing source or destination path" });
          continue;
        }

        // In dry run mode, just verify source exists and destination is writable
        if (dryRun) {
          const actualSource = isDocker ? `${HOST_PREFIX}${item.originalPath}` : item.originalPath;
          const actualDestDir = isDocker 
            ? `${HOST_PREFIX}${path.dirname(item.destinationPath)}` 
            : path.dirname(item.destinationPath);
          
          // Check source exists
          try {
            await fs.promises.access(actualSource, fs.constants.R_OK);
          } catch {
            failed.push({ id, error: `Source not found: ${item.originalPath}` });
            continue;
          }
          
          // Check destination directory is writable (create test dir)
          try {
            await fs.promises.mkdir(actualDestDir, { recursive: true });
            // Test write access by creating and removing temp file
            const testFile = path.join(actualDestDir, `.write_test_${Date.now()}`);
            await fs.promises.writeFile(testFile, 'test');
            await fs.promises.unlink(testFile);
          } catch (err: any) {
            failed.push({ id, error: `Destination not writable: ${err.message}` });
            continue;
          }
          
          organized.push({ id, status: 'verified', from: item.originalPath, to: item.destinationPath });
          continue;
        }

        // Actually move the file
        const moveResult = await moveFileToDestination(
          item.originalPath,
          item.destinationPath,
          isDocker
        );

        if (!moveResult.success) {
          // Log failure but continue with other files
          await storage.createLog({
            mediaItemId: id,
            action: "organize",
            fromPath: item.originalPath,
            toPath: item.destinationPath,
            success: false,
            message: `Failed to move: ${moveResult.error}`,
          });
          failed.push({ id, error: moveResult.error });
          continue;
        }

        // Update item status after successful move
        await storage.updateMediaItem(id, { 
          status: "organized",
          originalPath: item.destinationPath // Update path to new location
        });

        // Create or update movie or TV series entry
        if (item.detectedType === "movie" && item.detectedName) {
          const existingMovie = await storage.getMovieByName(item.detectedName);
          if (!existingMovie) {
            await storage.createMovie({
              name: item.detectedName,
              cleanedName: item.cleanedName || item.detectedName,
              year: item.year,
              filePath: item.destinationPath,
              tmdbId: item.tmdbId,
              posterPath: item.posterPath,
            });
          } else if (item.posterPath && !existingMovie.posterPath) {
            // Update existing movie with poster if it doesn't have one
            await storage.updateMovie(existingMovie.id, {
              posterPath: item.posterPath,
              tmdbId: item.tmdbId,
            });
          }
        } else if (item.detectedType === "tvshow" && item.detectedName) {
          // Extract series folder name from destination path
          const pathParts = item.destinationPath?.split("/").filter(Boolean) || [];
          const seriesFolderName = pathParts.length >= 2 ? pathParts[1] : null;
          
          let series = await storage.getTvSeriesByName(item.detectedName);
          if (!series) {
            series = await storage.createTvSeries({
              name: item.detectedName,
              cleanedName: item.cleanedName || item.detectedName,
              year: item.year,
              totalSeasons: item.season || 1,
              totalEpisodes: 1,
              folderPath: seriesFolderName,
              tmdbId: item.tmdbId,
              posterPath: item.posterPath,
            });
          } else {
            await storage.updateTvSeries(series.id, {
              totalSeasons: Math.max(series.totalSeasons || 0, item.season || 0),
              totalEpisodes: (series.totalEpisodes || 0) + 1,
              folderPath: series.folderPath || seriesFolderName,
              // Update poster if not already set
              ...(item.posterPath && !series.posterPath ? { posterPath: item.posterPath, tmdbId: item.tmdbId } : {}),
            });
          }
        }

        // Cleanup empty source folders
        const settings = await storage.getAllSettings();
        const sourcePaths = [
          ...(JSON.parse(settings.moviesPaths || "[]") as string[]),
          ...(JSON.parse(settings.tvShowsPaths || "[]") as string[])
        ];
        const deletedFolders = await cleanupEmptyFolders(
          item.originalPath, 
          sourcePaths,
          isDocker
        );
        
        // Create success log
        const cleanupMsg = deletedFolders.length > 0 
          ? ` (cleaned ${deletedFolders.length} empty folder(s))` 
          : "";
        await storage.createLog({
          mediaItemId: id,
          action: "organize",
          fromPath: item.originalPath,
          toPath: item.destinationPath,
          success: true,
          message: `Moved ${item.detectedType}: ${item.detectedName}${cleanupMsg}`,
        });

        organized.push(id);
        } // end of inner for loop (files in chunk)
        
        // Add delay between chunks to prevent system overload
        if (chunkStart + CHUNK_SIZE < ids.length) {
          await delay(CHUNK_DELAY);
        }
      } // end of outer for loop (chunks)
      
      console.log(`[Organize] Completed: ${organized.length} organized, ${failed.length} failed`);

      res.json({ 
        organized: dryRun ? organized : organized.length, 
        failed: failed.length,
        errors: failed,
        dryRun
      });
    } catch (error: any) {
      console.error("Organize error:", error);
      res.status(500).json({ error: "Failed to organize files", details: error.message });
    }
  });

  // Background organize job - starts organization and returns job ID for polling
  app.post("/api/organize-jobs", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids must be a non-empty array" });
      }

      // Check for active job
      const activeJob = await storage.getActiveOrganizeJob();
      if (activeJob) {
        return res.status(409).json({ error: "Organization already in progress", jobId: activeJob.id });
      }

      // Check if destination paths are configured
      const settings = await storage.getAllSettings();
      const moviesDestination = settings.moviesDestination || "";
      const tvShowsDestination = settings.tvShowsDestination || "";
      
      if (!moviesDestination && !tvShowsDestination) {
        return res.status(400).json({ 
          error: "Destination paths not configured. Please set Movies Destination and TV Shows Destination in Settings first." 
        });
      }

      // Create job
      const job = await storage.createOrganizeJob({
        status: "running",
        totalFiles: ids.length,
        processedFiles: 0,
        successCount: 0,
        failedCount: 0,
      });

      // Start background processing
      const isDocker = fs.existsSync("/host");
      const CHUNK_SIZE = 10;
      const CHUNK_DELAY = 200;
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      (async () => {
        let successCount = 0;
        let failedCount = 0;

        try {
          for (let chunkStart = 0; chunkStart < ids.length; chunkStart += CHUNK_SIZE) {
            const chunk = ids.slice(chunkStart, chunkStart + CHUNK_SIZE);
            
            for (const id of chunk) {
              const item = await storage.getMediaItemById(id);
              if (!item || !item.originalPath || !item.destinationPath) {
                failedCount++;
                await storage.updateOrganizeJob(job.id, { 
                  processedFiles: chunkStart + chunk.indexOf(id) + 1,
                  successCount,
                  failedCount,
                  currentFile: item?.originalFilename || id
                });
                continue;
              }

              await storage.updateOrganizeJob(job.id, { 
                currentFile: item.originalFilename 
              });

              const moveResult = await moveFileToDestination(
                item.originalPath,
                item.destinationPath,
                isDocker
              );

              if (moveResult.success) {
                await storage.updateMediaItem(id, { 
                  status: "organized",
                  originalPath: item.destinationPath
                });

                // Create or update movie or TV series entry
                if (item.detectedType === "movie" && item.detectedName) {
                  const existingMovie = await storage.getMovieByName(item.detectedName);
                  if (!existingMovie) {
                    await storage.createMovie({
                      name: item.detectedName,
                      cleanedName: item.cleanedName || item.detectedName,
                      year: item.year,
                      filePath: item.destinationPath,
                      tmdbId: item.tmdbId,
                      posterPath: item.posterPath,
                    });
                  } else if (item.posterPath && !existingMovie.posterPath) {
                    await storage.updateMovie(existingMovie.id, {
                      posterPath: item.posterPath,
                      tmdbId: item.tmdbId,
                    });
                  }
                } else if (item.detectedType === "tvshow" && item.detectedName) {
                  const pathParts = item.destinationPath?.split("/").filter(Boolean) || [];
                  const seriesFolderName = pathParts.length >= 2 ? pathParts[1] : null;
                  
                  let series = await storage.getTvSeriesByName(item.detectedName);
                  if (!series) {
                    await storage.createTvSeries({
                      name: item.detectedName,
                      cleanedName: item.cleanedName || item.detectedName,
                      year: item.year,
                      totalSeasons: item.season || 1,
                      totalEpisodes: 1,
                      folderPath: seriesFolderName,
                      tmdbId: item.tmdbId,
                      posterPath: item.posterPath,
                    });
                  } else {
                    await storage.updateTvSeries(series.id, {
                      totalSeasons: Math.max(series.totalSeasons || 0, item.season || 0),
                      totalEpisodes: (series.totalEpisodes || 0) + 1,
                      folderPath: series.folderPath || seriesFolderName,
                      ...(item.posterPath && !series.posterPath ? { posterPath: item.posterPath, tmdbId: item.tmdbId } : {}),
                    });
                  }
                }

                // Cleanup empty source folders
                const sourcePaths = [
                  ...(JSON.parse(settings.moviesPaths || "[]") as string[]),
                  ...(JSON.parse(settings.tvShowsPaths || "[]") as string[])
                ];
                await cleanupEmptyFolders(item.originalPath, sourcePaths, isDocker);

                successCount++;
              } else {
                failedCount++;
                await storage.createLog({
                  mediaItemId: id,
                  action: "organize",
                  fromPath: item.originalPath,
                  toPath: item.destinationPath,
                  success: false,
                  message: `Failed: ${moveResult.error}`,
                });
              }

              await storage.updateOrganizeJob(job.id, { 
                processedFiles: chunkStart + chunk.indexOf(id) + 1,
                successCount,
                failedCount
              });
            }

            if (chunkStart + CHUNK_SIZE < ids.length) {
              await delay(CHUNK_DELAY);
            }
          }

          await storage.updateOrganizeJob(job.id, {
            status: "completed",
            completedAt: new Date(),
            processedFiles: ids.length,
            successCount,
            failedCount
          });
          console.log(`[OrganizeJob] Completed: ${successCount} success, ${failedCount} failed`);
        } catch (err: any) {
          await storage.updateOrganizeJob(job.id, {
            status: "failed",
            error: err.message,
            completedAt: new Date()
          });
          console.error("[OrganizeJob] Failed:", err);
        }
      })();

      res.json({ jobId: job.id, totalFiles: ids.length });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to start organization", details: error.message });
    }
  });

  // Get organize job status
  app.get("/api/organize-jobs/:id", async (req, res) => {
    try {
      const job = await storage.getOrganizeJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      res.status(500).json({ error: "Failed to get job status" });
    }
  });

  // Get active organize job
  app.get("/api/organize-jobs", async (req, res) => {
    try {
      const activeJob = await storage.getActiveOrganizeJob();
      res.json(activeJob || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to get active job" });
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
      
      // Parse array paths with backward compatibility
      let moviesPaths: string[] = ["/Movies"];
      let tvShowsPaths: string[] = ["/TV Shows"];
      
      if (settings.moviesPaths) {
        try {
          moviesPaths = JSON.parse(settings.moviesPaths);
        } catch {
          moviesPaths = [settings.moviesPaths];
        }
      } else if (settings.moviesPath) {
        moviesPaths = [settings.moviesPath];
      }
      
      if (settings.tvShowsPaths) {
        try {
          tvShowsPaths = JSON.parse(settings.tvShowsPaths);
        } catch {
          tvShowsPaths = [settings.tvShowsPaths];
        }
      } else if (settings.tvShowsPath) {
        tvShowsPaths = [settings.tvShowsPath];
      }
      
      res.json({
        moviesPaths,
        tvShowsPaths,
        moviesDestination: settings.moviesDestination || "",
        tvShowsDestination: settings.tvShowsDestination || "",
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
        moviesPaths,
        tvShowsPaths,
        moviesDestination,
        tvShowsDestination,
        autoOrganize,
        removeReleaseGroups,
        fuzzyMatchThreshold,
        tmdbApiKey,
      } = req.body;

      // Store arrays as JSON strings
      if (moviesPaths !== undefined) {
        await storage.setSetting("moviesPaths", JSON.stringify(moviesPaths));
      }
      if (tvShowsPaths !== undefined) {
        await storage.setSetting("tvShowsPaths", JSON.stringify(tvShowsPaths));
      }
      // Store destination paths
      if (moviesDestination !== undefined) {
        await storage.setSetting("moviesDestination", moviesDestination);
      }
      if (tvShowsDestination !== undefined) {
        await storage.setSetting("tvShowsDestination", tvShowsDestination);
      }
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

  // Refresh posters from TMDB for all movies and TV shows
  app.post("/api/refresh-posters", async (req, res) => {
    try {
      const apiKey = await getTmdbApiKey();
      if (!apiKey) {
        return res.status(400).json({ error: "TMDB API key not configured. Set it in Settings." });
      }

      const movies = await storage.getAllMovies();
      const tvSeries = await storage.getAllTvSeries();
      
      let updatedMovies = 0;
      let updatedTvShows = 0;

      // Update movies
      for (const movie of movies) {
        if (!movie.posterPath && movie.name) {
          try {
            let url = `${TMDB_BASE_URL}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(movie.name)}`;
            if (movie.year) url += `&year=${movie.year}`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
              const posterPath = data.results[0].poster_path 
                ? `https://image.tmdb.org/t/p/w342${data.results[0].poster_path}` 
                : null;
              
              if (posterPath) {
                await storage.updateMovie(movie.id, { 
                  posterPath, 
                  tmdbId: data.results[0].id 
                });
                updatedMovies++;
              }
            }
            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 100));
          } catch (e) {
            console.error(`Failed to fetch poster for movie: ${movie.name}`, e);
          }
        }
      }

      // Update TV shows
      for (const series of tvSeries) {
        if (!series.posterPath && series.name) {
          try {
            let url = `${TMDB_BASE_URL}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(series.name)}`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
              const posterPath = data.results[0].poster_path 
                ? `https://image.tmdb.org/t/p/w342${data.results[0].poster_path}` 
                : null;
              
              if (posterPath) {
                await storage.updateTvSeries(series.id, { 
                  posterPath, 
                  tmdbId: data.results[0].id 
                });
                updatedTvShows++;
              }
            }
            await new Promise(r => setTimeout(r, 100));
          } catch (e) {
            console.error(`Failed to fetch poster for TV show: ${series.name}`, e);
          }
        }
      }

      res.json({ 
        success: true, 
        updatedMovies, 
        updatedTvShows,
        message: `Updated ${updatedMovies} movie posters and ${updatedTvShows} TV show posters`
      });
    } catch (error) {
      console.error("Refresh posters error:", error);
      res.status(500).json({ error: "Failed to refresh posters" });
    }
  });

  return httpServer;
}
