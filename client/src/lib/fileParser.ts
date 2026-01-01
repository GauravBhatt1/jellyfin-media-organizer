import { RELEASE_GROUPS, VIDEO_EXTENSIONS } from "@shared/schema";
import type { MediaType } from "@shared/schema";

export interface ParsedMedia {
  originalFilename: string;
  cleanedName: string;
  detectedType: MediaType;
  detectedName: string;
  year: number | null;
  season: number | null;
  episode: number | null;
  extension: string;
  confidence: number;
}

// Clean filename by removing release groups, quality tags, etc.
export function cleanFilename(filename: string): string {
  let cleaned = filename;
  
  // Remove file extension
  const extMatch = filename.match(/\.[a-zA-Z0-9]{2,4}$/);
  if (extMatch) {
    cleaned = cleaned.slice(0, -extMatch[0].length);
  }
  
  // Replace dots and underscores with spaces
  cleaned = cleaned.replace(/[._]/g, " ");
  
  // Remove content in brackets/parentheses that looks like quality/codec info
  cleaned = cleaned.replace(/\[.*?\]/g, " ");
  cleaned = cleaned.replace(/\((?!(?:19|20)\d{2}\))[^)]*\)/g, " ");
  
  // Remove release groups and quality tags (case insensitive)
  for (const group of RELEASE_GROUPS) {
    const regex = new RegExp(`\\b${group}\\b`, "gi");
    cleaned = cleaned.replace(regex, " ");
  }
  
  // Remove standalone numbers that look like file indices (e.g., "01", "001")
  cleaned = cleaned.replace(/\b\d{1,3}\b(?!\s*(?:x|e|episode|season|s\d))/gi, " ");
  
  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  
  return cleaned;
}

// Extract year from filename
export function extractYear(filename: string): number | null {
  // Match years in parentheses first (most reliable)
  const parenMatch = filename.match(/\(?(19[5-9]\d|20[0-2]\d)\)?/);
  if (parenMatch) {
    return parseInt(parenMatch[1], 10);
  }
  return null;
}

// Detect TV show episode patterns
export function detectTVShowPattern(filename: string): { season: number; episode: number } | null {
  const patterns = [
    // S01E01, S1E1, s01e01
    /[Ss](\d{1,2})[Ee](\d{1,3})/,
    // 1x01, 01x01
    /(\d{1,2})[xX](\d{1,3})/,
    // Season 1 Episode 1
    /[Ss]eason\s*(\d{1,2})\s*[Ee]pisode\s*(\d{1,3})/i,
    // S01 E01 (with space)
    /[Ss](\d{1,2})\s+[Ee](\d{1,3})/,
    // EP01, Ep01 (episode only, assume season 1)
    /[Ee][Pp]?(\d{1,3})(?!\d)/,
  ];
  
  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      if (match.length === 2) {
        // Episode only pattern
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

// Get file extension
export function getExtension(filename: string): string {
  const match = filename.match(/\.[a-zA-Z0-9]{2,4}$/);
  return match ? match[0].toLowerCase() : "";
}

// Check if file is a video
export function isVideoFile(filename: string): boolean {
  const ext = getExtension(filename);
  return VIDEO_EXTENSIONS.includes(ext);
}

// Parse a media filename
export function parseMediaFilename(filename: string): ParsedMedia {
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
    
    // Extract series name (everything before episode pattern)
    const nameMatch = filename.match(/^(.+?)(?:[Ss]\d|Season|\d+[xX])/i);
    if (nameMatch) {
      detectedName = cleanFilename(nameMatch[1]);
    }
  } else if (year) {
    detectedType = "movie";
    confidence = 70;
    
    // Extract movie name (everything before year)
    const yearIndex = filename.indexOf(year.toString());
    if (yearIndex > 0) {
      detectedName = cleanFilename(filename.substring(0, yearIndex));
    }
  }
  
  // Boost confidence for cleaner filenames
  if (detectedName.length > 3 && detectedName.length < 100) {
    confidence += 10;
  }
  
  return {
    originalFilename: filename,
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

// Normalize name for comparison (for duplicate detection)
export function normalizeForComparison(name: string): string {
  return cleanFilename(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

// Calculate similarity between two strings (Levenshtein-based)
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeForComparison(str1);
  const s2 = normalizeForComparison(str2);
  
  if (s1 === s2) return 100;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    const minLen = Math.min(s1.length, s2.length);
    const maxLen = Math.max(s1.length, s2.length);
    return Math.round((minLen / maxLen) * 100);
  }
  
  // Levenshtein distance
  const matrix: number[][] = [];
  
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const maxLen = Math.max(s1.length, s2.length);
  const distance = matrix[s1.length][s2.length];
  return Math.round(((maxLen - distance) / maxLen) * 100);
}

// Generate Jellyfin-compatible destination path
export function generateDestinationPath(
  parsed: ParsedMedia,
  basePaths: { movies: string; tvshows: string }
): string {
  const { detectedType, detectedName, year, season, episode, extension } = parsed;
  
  // Capitalize first letter of each word
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
  
  return `${basePaths.movies}/Unsorted/${parsed.originalFilename}`;
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
