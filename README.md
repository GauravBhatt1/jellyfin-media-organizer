# Jellyfin Media Organizer

A web-based media file organization tool that automatically organizes video files into Jellyfin-compatible folder structures.

## Features

- Scan and parse media filenames
- Detect TV shows and movies automatically
- Fuzzy duplicate detection
- Organize into Jellyfin folder structure
- Docker support for easy deployment

## Quick Start

```bash
git clone https://github.com/GauravBhatt1/jellyfin-media-organizer.git
cd jellyfin-media-organizer
cp .env.example .env
docker-compose up -d
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for full instructions.
