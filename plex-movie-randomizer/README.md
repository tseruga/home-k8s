# Plex Movie Randomizer

A one-page Svelte app that randomly selects movies from your Plex watchlist. Perfect for when you can't decide what to watch!

## Features

- 🎬 Connect directly to your myPlex account (plex.tv) for watchlist data
- 🎲 Randomly select movies from your watchlist with a fun slot machine animation
- 🖼️ Display movie posters, ratings, and summaries
- 🔗 Quick links to IMDb for selected movies
- 🎛️ Filter movies by duration, rating, and genre exclusions (requires local server)
- 💾 Save your Plex configuration locally
- 📱 Responsive design that works on mobile and desktop

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Configure your Plex authentication:**
   - Click the "Settings" button in the app
   - Enter your Plex authentication token (required)
   - Enter your Plex server URL (required for genre filtering and better poster loading)

## Getting Your Plex Token

You'll need a Plex authentication token to access your watchlist. Here's how to get it:

1. **Easy method:** Visit [plex.tv/claim](https://plex.tv/claim) while logged in
2. **Manual method:** Follow [Plex's official guide](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/)

## How to Use

1. Configure your Plex authentication token (required)
2. Click "Load Watchlist" to fetch movies from your plex.tv watchlist
3. Optionally configure your Plex server URL and click "Load Genres" for genre filtering
4. Configure filters for movie duration, rating, and genre exclusions (if genres loaded)
5. Click "Pick Random Movie" to start the slot machine animation
6. Watch as the slot machine spins and reveals your randomly selected movie
7. View movie details including poster, summary, rating, year, and genres (if loaded)
8. Click "Pick Another" to select a different random movie
9. Click the IMDb button to view the movie on IMDb (if available)

## API Implementation

This app uses a two-step process for comprehensive movie data:

### **Step 1: Watchlist Data (plex.tv)**
- **Endpoint**: `https://metadata.provider.plex.tv/library/sections/watchlist/all`
- **Data**: Basic movie information (title, year, summary, rating, duration, posters)
- **Authentication**: Plex authentication token
- **Required**: Yes (core functionality)

### **Step 2: Detailed Metadata (Local Server)**
- **Endpoint**: `{baseUrl}/library/metadata/{ratingKey}` per [plexapi.dev](https://plexapi.dev/api-reference/library/get-media-metadata)
- **Data**: Genre information, detailed metadata
- **Authentication**: Plex server URL + token
- **Required**: No (optional for genre filtering)

The app connects to:
- **plex.tv**: For watchlist data and basic movie metadata (required)
- **Your local Plex server**: For detailed metadata including genres (optional)

No backend server is required - everything runs client-side in your browser.

## Configuration Options

- **Plex Token** (Required): Your authentication token from plex.tv
- **Plex Server URL** (Optional): Your local Plex server URL (e.g., `http://192.168.1.100:32400`)
  - Required for genre filtering functionality
  - Improves poster loading performance when available
  - If not provided, basic filtering by duration and rating still works

## Troubleshooting

- **"Invalid Plex token"**: Verify your Plex token is valid and not expired
- **"No movies found"**: Make sure you have movies in your Plex watchlist at plex.tv
- **"Failed to fetch watchlist from plex.tv"**: Check your internet connection and token validity
- **Genre filtering not available**: Configure your Plex server URL and click "Load Genres"
- **Images not loading**: 
  - Try configuring your local Plex server URL for better poster loading
  - Some movies may not have poster images available
- **Slow genre loading**: Genre information requires individual API calls per movie, which can take time for large watchlists

## Technical Details

- Built with SvelteKit and TypeScript
- **Two-step data loading**:
  1. Fast watchlist loading from plex.tv
  2. Optional detailed metadata fetching from local server
- Implements proper pagination for large watchlists
- Batched processing for genre loading (5 movies at a time)
- Comprehensive error handling and progress indicators
- Works offline for basic functionality (watchlist only)
