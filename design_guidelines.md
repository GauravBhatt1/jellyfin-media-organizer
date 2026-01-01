# Design Guidelines: Jellyfin Media Manager via Telegram Bot

## Design Approach
**System-Based Approach**: Material Design adapted for media management
**References**: Plex dashboard + Google Drive file browser + Linear's clean data tables
**Rationale**: Utility-focused application requiring clear information hierarchy, efficient workflows, and file management patterns

## Core Design Elements

### Typography
- **Primary Font**: Inter (via Google Fonts CDN)
- **Headers**: font-bold, text-2xl to text-4xl
- **Body**: font-normal, text-base
- **Labels/Metadata**: font-medium, text-sm text-gray-600

### Layout System
**Tailwind Spacing Units**: 2, 4, 6, 8, 12, 16, 24
- Component padding: p-4, p-6
- Section spacing: space-y-4, space-y-6
- Page margins: px-6, py-8

### Component Library

**Dashboard Layout**:
- Left sidebar (w-64): Navigation, bot status, quick stats
- Main content area: Full-width file browser/manager
- Top bar: Breadcrumb navigation, search, settings icon

**File Browser**:
- List view with columns: Name, Type (Movie/Series), Season/Episode, Size, Status, Actions
- Grid view toggle for visual browsing with poster thumbnails
- Drag-and-drop upload zone (dashed border, centered icon + text)

**Media Organization Panel**:
- Two-column layout: Source files (left) → Organized structure (right)
- Tree view for folder hierarchy matching Jellyfin structure
- Episode matcher: Input field for series name/season with auto-detection

**Status Indicators**:
- Telegram sync status: green/orange/red dot indicators
- Upload progress: linear progress bars with percentage
- Organization status badges: "Organized", "Pending", "Conflict"

**Forms & Inputs**:
- Outlined text fields with floating labels
- Dropdowns for series/season selection
- Toggle switches for auto-organize settings
- Action buttons: Primary (blue), Secondary (gray outline)

**Data Tables**:
- Zebra striping for rows (subtle gray alternation)
- Sortable column headers with arrow icons
- Checkbox selection for batch operations
- Row actions menu (three-dot icon)

**Modal Dialogs**:
- Conflict resolution: Side-by-side comparison of existing vs. new files
- Bulk organizer: Preview changes before applying
- Settings panel: Jellyfin path templates, naming conventions

### Navigation
- Persistent left sidebar with icons + labels:
  - Dashboard, Movies, TV Shows, Upload Queue, Settings, Logs
- Active state: Blue accent background (bg-blue-50), bold text

### Icons
**Library**: Heroicons (via CDN)
- Folder icons for directories
- Film icon for movies
- TV icon for series
- Upload cloud icon
- Check/warning/error icons for status

### Animations
**Minimal, functional only**:
- Smooth height transitions for expanding panels (transition-all duration-200)
- Fade-in for newly organized files
- No decorative animations

## Images
No hero images needed. Application uses:
- Movie/TV show poster thumbnails (aspect-ratio-2/3)
- Placeholder gray rectangles with film icon when no poster available
- Small Jellyfin/Telegram logo icons in header/footer

## Key Screens

1. **Dashboard**: Overview stats, recent uploads, quick actions
2. **Movies Manager**: Grid/list of all movies, filter/sort controls
3. **TV Shows Manager**: Expandable series → seasons → episodes hierarchy
4. **Upload Queue**: Real-time Telegram uploads with organization preview
5. **Bulk Organizer**: Manage existing 30 TV shows, batch rename/move

## Unique Features
- Live Telegram bot sync indicator in top-right
- Episode pattern detection preview ("S01E05" format validator)
- Jellyfin folder structure visualizer before applying changes
- One-click "Organize All" with undo capability