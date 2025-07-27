# Plex Movie Randomizer

A one-page Svelte app that randomly selects movies from your Plex watchlist. Perfect for when you can't decide what to watch!

## Features

- 🎬 Connect directly to your Plex server
- 🎲 Randomly select movies from your watchlist
- 🖼️ Display movie posters, ratings, and summaries
- 🔗 Quick links to IMDb for selected movies
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

3. **Configure your Plex server:**
   - Click the "Settings" button in the app
   - Enter your Plex server URL (e.g., `http://your-plex-server:32400`)
   - Enter your Plex authentication token

## Getting Your Plex Token

You'll need a Plex authentication token to access your watchlist. Here's how to get it:

1. **Easy method:** Visit [plex.tv/claim](https://plex.tv/claim) while logged in
2. **Manual method:** Follow [Plex's official guide](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/)

## How to Use

1. Configure your Plex server settings (done once)
2. Click "Load Watchlist" to fetch movies from your Plex watchlist
3. Click "Pick Random Movie" to randomly select a movie
4. View movie details including poster, summary, rating, and year
5. Click "Pick Another" to select a different random movie
6. Click the IMDb button to view the movie on IMDb (if available)

## API Requirements

The app connects directly to:
- Your Plex server for authentication
- Plex's metadata API for watchlist data
- Plex's image servers for movie posters

No backend server is required - everything runs client-side in your browser.

## Troubleshooting

- **"Failed to authenticate"**: Check that your Plex server URL and token are correct
- **"No movies found"**: Make sure you have movies in your Plex watchlist
- **CORS errors**: Your Plex server needs to allow cross-origin requests from your browser
- **Missing posters**: Some movies may not have poster images available

## Building for Production

```bash
npm run build
```

The built files will be in the `build/` directory and can be served from any static web server.

## Configuration Storage

Your Plex server configuration is stored locally in your browser's localStorage. It won't be shared or transmitted anywhere except to your configured Plex server.
