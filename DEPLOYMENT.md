# Jellyfin Media Organizer - VPS Deployment Guide

## Quick Start with Docker Compose

### Step 1: Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/jellyfin-media-organizer.git
cd jellyfin-media-organizer
```

### Step 2: Configure Environment
```bash
# Copy example environment file
cp .env.example .env

# Edit the .env file with your settings
nano .env
```

Update these values in `.env`:
- `SESSION_SECRET` - A random secret key for sessions
- `SOURCE_PATH` - Path to your incoming files (from Telegram/Rclone)
- `MOVIES_PATH` - Path where movies should be organized
- `TV_SHOWS_PATH` - Path where TV shows should be organized

### Step 3: Start the Application
```bash
# Build and start containers
docker-compose up -d

# Check logs
docker-compose logs -f app
```

### Step 4: Access the Application
Open your browser and go to: `http://YOUR_VPS_IP:5000`

---

## Portainer Deployment

### Using Portainer Stacks

1. Open Portainer and go to **Stacks**
2. Click **Add Stack**
3. Name it `jellyfin-media-organizer`
4. Paste the contents of `docker-compose.yml`
5. Add environment variables:
   - `SESSION_SECRET` = your-secret-key
   - `SOURCE_PATH` = /path/to/inbox
   - `MOVIES_PATH` = /path/to/movies
   - `TV_SHOWS_PATH` = /path/to/tvshows
6. Click **Deploy the stack**

---

## Directory Structure for Jellyfin

After organizing, your files will be structured like this:

```
/media/movies/
  Movie Name (2023)/
    Movie Name (2023).mkv

/media/tvshows/
  Series Name (2020)/
    Season 01/
      Series Name - S01E01.mkv
      Series Name - S01E02.mkv
    Season 02/
      Series Name - S02E01.mkv
```

---

## Connecting with Rclone + Telegram Bot

If you're using a Telegram mirror bot with Rclone:

1. Configure Rclone to sync files to `SOURCE_PATH`
2. The Media Organizer will scan files from this directory
3. Organized files will be moved to Movies/TV Shows paths
4. Point Jellyfin to the Movies and TV Shows directories

---

## Useful Commands

```bash
# View logs
docker-compose logs -f

# Restart application
docker-compose restart app

# Stop everything
docker-compose down

# Rebuild after code changes
docker-compose up -d --build

# View running containers
docker-compose ps
```

---

## Troubleshooting

### Database connection issues
```bash
# Check if database is healthy
docker-compose exec db pg_isready -U jellyfin
```

### Permission issues with media files
```bash
# Make sure directories are accessible
chmod -R 755 /path/to/media
chown -R 1000:1000 /path/to/media
```

### Reset database
```bash
docker-compose down -v
docker-compose up -d
```
