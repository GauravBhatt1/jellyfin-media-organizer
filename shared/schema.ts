import { pgTable, text, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// Media type enum
export type MediaType = "movie" | "tvshow" | "unknown";
export type OrganizationStatus = "pending" | "organized" | "conflict" | "duplicate";

// Media Item - scanned files
export const mediaItems = pgTable("media_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalFilename: text("original_filename").notNull(),
  originalPath: text("original_path").notNull(),
  fileSize: text("file_size"),
  extension: text("extension"),
  detectedType: text("detected_type").$type<MediaType>().default("unknown"),
  detectedName: text("detected_name"),
  cleanedName: text("cleaned_name"),
  year: integer("year"),
  season: integer("season"),
  episode: integer("episode"),
  episodeTitle: text("episode_title"),
  status: text("status").$type<OrganizationStatus>().default("pending"),
  destinationPath: text("destination_path"),
  confidence: integer("confidence").default(0),
  duplicateOf: varchar("duplicate_of"),
  createdAt: timestamp("created_at").defaultNow(),
});

// TV Series
export const tvSeries = pgTable("tv_series", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  cleanedName: text("cleaned_name").notNull(),
  year: integer("year"),
  totalSeasons: integer("total_seasons").default(1),
  totalEpisodes: integer("total_episodes").default(0),
  folderPath: text("folder_path"),
});

// Movies
export const movies = pgTable("movies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  cleanedName: text("cleaned_name").notNull(),
  year: integer("year"),
  filePath: text("file_path"),
});

// Organization logs
export const organizationLogs = pgTable("organization_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mediaItemId: varchar("media_item_id"),
  action: text("action").notNull(),
  fromPath: text("from_path"),
  toPath: text("to_path"),
  success: boolean("success").default(true),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Settings
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});

// Insert schemas
export const insertMediaItemSchema = createInsertSchema(mediaItems).omit({ id: true, createdAt: true });
export const insertTvSeriesSchema = createInsertSchema(tvSeries).omit({ id: true });
export const insertMovieSchema = createInsertSchema(movies).omit({ id: true });
export const insertOrganizationLogSchema = createInsertSchema(organizationLogs).omit({ id: true, createdAt: true });
export const insertSettingsSchema = createInsertSchema(settings).omit({ id: true });

// Types
export type MediaItem = typeof mediaItems.$inferSelect;
export type InsertMediaItem = z.infer<typeof insertMediaItemSchema>;
export type TvSeries = typeof tvSeries.$inferSelect;
export type InsertTvSeries = z.infer<typeof insertTvSeriesSchema>;
export type Movie = typeof movies.$inferSelect;
export type InsertMovie = z.infer<typeof insertMovieSchema>;
export type OrganizationLog = typeof organizationLogs.$inferSelect;
export type InsertOrganizationLog = z.infer<typeof insertOrganizationLogSchema>;
export type Settings = typeof settings.$inferSelect;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;

// Common release groups/sites to clean from filenames
export const RELEASE_GROUPS = [
  // Release groups
  "hdhub4u", "yts", "rarbg", "1337x", "yify", "ettv", "eztv", "lol", "dimension",
  "fgt", "sparks", "axxo", "fxg", "batv", "ntb", "mkvcage", "pahe", "psa",
  "tamilrockers", "filmyzilla", "movierulz", "khatrimaza", "bolly4u", "worldfree4u",
  "filmywap", "mp4moviez", "9xmovies", "downloadhub", "cinevood", "katmoviehd",
  "moviesverse", "vegamovies", "ssrmovies", "themoviesflix", "hubflix", "filmyhit",
  "extramovies", "moviesbaba", "skymovieshd", "movieswood", "jalshamoviez",
  
  // Quality tags
  "hdtv", "webrip", "bluray", "brrip", "dvdrip", "web-dl", "webdl", "hdrip",
  "hdcam", "camrip", "cam", "ts", "telesync", "dvdscr", "screener", "r5",
  "720p", "1080p", "2160p", "4k", "uhd", "hd", "sd", "480p", "360p",
  "hdr", "hdr10", "dolby", "atmos", "truehd", "dts-hd", "dts-x",
  
  // Codecs
  "x264", "x265", "hevc", "h264", "h265", "aac", "ac3", "dts", "mp3",
  "avc", "xvid", "divx", "mpeg", "vp9", "av1", "10bit", "8bit",
  
  // Audio/Language
  "hindi", "english", "dual", "audio", "dubbed", "multi", "org",
  "esub", "esubs", "subs", "subtitle", "subtitles", "hardsub", "softsub",
  "tam", "tel", "kan", "mal", "ben", "mar", "guj", "pun",
  
  // Misc tags
  "extended", "unrated", "directors", "cut", "remastered", "imax",
  "proper", "real", "rerip", "repack", "internal", "limited",
  "telegram", "channel", "group", "rip", "print", "clean",
  "amzn", "nf", "hulu", "dsnp", "atvp", "hmax", "zee5", "hotstar"
];

// Video file extensions
export const VIDEO_EXTENSIONS = [
  ".mkv", ".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".mpg", ".mpeg", ".ts"
];

// Users table (kept from original)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
