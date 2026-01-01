import {
  type User,
  type InsertUser,
  type MediaItem,
  type InsertMediaItem,
  type TvSeries,
  type InsertTvSeries,
  type Movie,
  type InsertMovie,
  type OrganizationLog,
  type InsertOrganizationLog,
  type Settings,
  type InsertSettings,
  RELEASE_GROUPS,
} from "@shared/schema";
import { randomUUID } from "crypto";

// Duplicate group type
export interface DuplicateItem {
  id: string;
  originalFilename: string;
  cleanedName: string;
  similarity: number;
  isOriginal: boolean;
  fileSize?: string;
}

export interface DuplicateGroup {
  groupId: string;
  baseName: string;
  items: DuplicateItem[];
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Media Items
  getAllMediaItems(): Promise<MediaItem[]>;
  getMediaItemById(id: string): Promise<MediaItem | undefined>;
  getMediaItemByFilename(filename: string): Promise<MediaItem | undefined>;
  getPendingMediaItems(): Promise<MediaItem[]>;
  createMediaItem(item: InsertMediaItem): Promise<MediaItem>;
  updateMediaItem(id: string, updates: Partial<MediaItem>): Promise<MediaItem | undefined>;
  deleteMediaItem(id: string): Promise<boolean>;
  bulkDeleteMediaItems(ids: string[]): Promise<number>;

  // TV Series
  getAllTvSeries(): Promise<TvSeries[]>;
  getTvSeriesById(id: string): Promise<TvSeries | undefined>;
  getTvSeriesByName(name: string): Promise<TvSeries | undefined>;
  createTvSeries(series: InsertTvSeries): Promise<TvSeries>;
  updateTvSeries(id: string, updates: Partial<TvSeries>): Promise<TvSeries | undefined>;
  deleteTvSeries(id: string): Promise<boolean>;

  // Movies
  getAllMovies(): Promise<Movie[]>;
  getMovieById(id: string): Promise<Movie | undefined>;
  getMovieByName(name: string): Promise<Movie | undefined>;
  createMovie(movie: InsertMovie): Promise<Movie>;
  deleteMovie(id: string): Promise<boolean>;

  // Organization Logs
  getAllLogs(): Promise<OrganizationLog[]>;
  createLog(log: InsertOrganizationLog): Promise<OrganizationLog>;

  // Settings
  getSetting(key: string): Promise<string | undefined>;
  setSetting(key: string, value: string): Promise<void>;
  getAllSettings(): Promise<Record<string, string>>;

  // Duplicate Detection
  findDuplicates(threshold?: number): Promise<DuplicateGroup[]>;
}

// Helper: clean filename for comparison
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

// Helper: normalize for comparison
function normalizeForComparison(name: string): string {
  return cleanFilename(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

// Helper: calculate similarity
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeForComparison(str1);
  const s2 = normalizeForComparison(str2);

  if (s1 === s2) return 100;
  if (s1.length === 0 || s2.length === 0) return 0;

  if (s1.includes(s2) || s2.includes(s1)) {
    const minLen = Math.min(s1.length, s2.length);
    const maxLen = Math.max(s1.length, s2.length);
    return Math.round((minLen / maxLen) * 100);
  }

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

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private mediaItems: Map<string, MediaItem>;
  private tvSeries: Map<string, TvSeries>;
  private movies: Map<string, Movie>;
  private logs: Map<string, OrganizationLog>;
  private settings: Map<string, string>;

  constructor() {
    this.users = new Map();
    this.mediaItems = new Map();
    this.tvSeries = new Map();
    this.movies = new Map();
    this.logs = new Map();
    this.settings = new Map();

    // Set default settings
    this.settings.set("sourcePath", "/Inbox");
    this.settings.set("moviesPath", "/Movies");
    this.settings.set("tvShowsPath", "/TV Shows");
    this.settings.set("autoOrganize", "false");
    this.settings.set("removeReleaseGroups", "true");
    this.settings.set("fuzzyMatchThreshold", "80");
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Media Items
  async getAllMediaItems(): Promise<MediaItem[]> {
    return Array.from(this.mediaItems.values()).sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async getMediaItemById(id: string): Promise<MediaItem | undefined> {
    return this.mediaItems.get(id);
  }

  async getMediaItemByFilename(filename: string): Promise<MediaItem | undefined> {
    return Array.from(this.mediaItems.values()).find(
      (item) => item.originalFilename === filename
    );
  }

  async getPendingMediaItems(): Promise<MediaItem[]> {
    return Array.from(this.mediaItems.values()).filter(
      (item) => item.status === "pending"
    );
  }

  async createMediaItem(item: InsertMediaItem): Promise<MediaItem> {
    const id = randomUUID();
    const mediaItem: MediaItem = {
      ...item,
      id,
      createdAt: new Date(),
    };
    this.mediaItems.set(id, mediaItem);
    return mediaItem;
  }

  async updateMediaItem(
    id: string,
    updates: Partial<MediaItem>
  ): Promise<MediaItem | undefined> {
    const item = this.mediaItems.get(id);
    if (!item) return undefined;

    const updated = { ...item, ...updates };
    this.mediaItems.set(id, updated);
    return updated;
  }

  async deleteMediaItem(id: string): Promise<boolean> {
    return this.mediaItems.delete(id);
  }

  async bulkDeleteMediaItems(ids: string[]): Promise<number> {
    let count = 0;
    for (const id of ids) {
      if (this.mediaItems.delete(id)) {
        count++;
      }
    }
    return count;
  }

  // TV Series
  async getAllTvSeries(): Promise<TvSeries[]> {
    return Array.from(this.tvSeries.values());
  }

  async getTvSeriesById(id: string): Promise<TvSeries | undefined> {
    return this.tvSeries.get(id);
  }

  async getTvSeriesByName(name: string): Promise<TvSeries | undefined> {
    const normalizedName = normalizeForComparison(name);
    return Array.from(this.tvSeries.values()).find(
      (series) => normalizeForComparison(series.name) === normalizedName
    );
  }

  async createTvSeries(series: InsertTvSeries): Promise<TvSeries> {
    const id = randomUUID();
    const tvSeries: TvSeries = { ...series, id };
    this.tvSeries.set(id, tvSeries);
    return tvSeries;
  }

  async updateTvSeries(
    id: string,
    updates: Partial<TvSeries>
  ): Promise<TvSeries | undefined> {
    const series = this.tvSeries.get(id);
    if (!series) return undefined;

    const updated = { ...series, ...updates };
    this.tvSeries.set(id, updated);
    return updated;
  }

  async deleteTvSeries(id: string): Promise<boolean> {
    return this.tvSeries.delete(id);
  }

  // Movies
  async getAllMovies(): Promise<Movie[]> {
    return Array.from(this.movies.values());
  }

  async getMovieById(id: string): Promise<Movie | undefined> {
    return this.movies.get(id);
  }

  async getMovieByName(name: string): Promise<Movie | undefined> {
    const normalizedName = normalizeForComparison(name);
    return Array.from(this.movies.values()).find(
      (movie) => normalizeForComparison(movie.name) === normalizedName
    );
  }

  async createMovie(movie: InsertMovie): Promise<Movie> {
    const id = randomUUID();
    const newMovie: Movie = { ...movie, id };
    this.movies.set(id, newMovie);
    return newMovie;
  }

  async deleteMovie(id: string): Promise<boolean> {
    return this.movies.delete(id);
  }

  // Organization Logs
  async getAllLogs(): Promise<OrganizationLog[]> {
    return Array.from(this.logs.values()).sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async createLog(log: InsertOrganizationLog): Promise<OrganizationLog> {
    const id = randomUUID();
    const orgLog: OrganizationLog = {
      ...log,
      id,
      createdAt: new Date(),
    };
    this.logs.set(id, orgLog);
    return orgLog;
  }

  // Settings
  async getSetting(key: string): Promise<string | undefined> {
    return this.settings.get(key);
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.settings.set(key, value);
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    this.settings.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  // Duplicate detection (part of IStorage interface)
  async findDuplicates(threshold: number = 80): Promise<DuplicateGroup[]> {
    const items = await this.getAllMediaItems();
    const groups: Map<
      string,
      Array<{
        id: string;
        originalFilename: string;
        cleanedName: string;
        similarity: number;
        isOriginal: boolean;
      }>
    > = new Map();

    for (const item of items) {
      const cleanedName = cleanFilename(item.originalFilename);
      const normalizedName = normalizeForComparison(item.originalFilename);

      let foundGroup = false;

      for (const [groupKey, groupItems] of groups) {
        const firstItem = groupItems[0];
        const similarity = calculateSimilarity(
          item.originalFilename,
          firstItem.originalFilename
        );

        if (similarity >= threshold) {
          groupItems.push({
            id: item.id,
            originalFilename: item.originalFilename,
            cleanedName,
            similarity,
            isOriginal: false,
          });
          foundGroup = true;
          break;
        }
      }

      if (!foundGroup) {
        groups.set(normalizedName, [
          {
            id: item.id,
            originalFilename: item.originalFilename,
            cleanedName,
            similarity: 100,
            isOriginal: true,
          },
        ]);
      }
    }

    const result: DuplicateGroup[] = [];

    for (const [groupKey, groupItems] of groups) {
      if (groupItems.length > 1) {
        result.push({
          groupId: randomUUID(),
          baseName: groupItems[0].cleanedName,
          items: groupItems,
        });
      }
    }

    return result;
  }
}

export const storage = new MemStorage();
