#!/usr/bin/env python3
"""
Plex Watchlist to Radarr Profile Updater

This script monitors a Plex watchlist and automatically updates
the quality profile in Radarr for movies on the watchlist.
"""

import requests
import logging
import time
import os
from pathlib import Path
from typing import List, Dict, Optional
import yaml
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

from plexapi.server import PlexServer

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('plex_radarr_updater.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class HealthCheckHandler(BaseHTTPRequestHandler):
    """Simple health check endpoint for Kubernetes"""
    
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'OK')
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        # Suppress access logs
        pass


class PlexAPI:
    """Interface for Plex API operations using plexapi library"""
    
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url
        self.token = token
        self.server = None
        self.account = None
        
        try:
            # Connect to Plex server
            self.server = PlexServer(base_url, token)
            
            # Try to get MyPlex account for watchlist access
            try:
                self.account = self.server.myPlexAccount()
                logger.info(f"Connected to Plex server: {self.server.friendlyName}")
                logger.info(f"Connected to MyPlex account: {self.account.username}")
            except Exception as e:
                logger.warning(f"Could not connect to MyPlex account: {e}")
                logger.info("Watchlist functionality may be limited")
                
        except Exception as e:
            logger.error(f"Failed to connect to Plex server: {e}")
            raise

    def get_watchlist(self) -> List[Dict]:
        """Get movies from Plex watchlist"""
        movies = []
        
        if not self.account:
            logger.error("MyPlex account required for watchlist access")
            return movies
            
        try:
            # Get watchlist items
            watchlist_items = self.account.watchlist()
            
            for item in watchlist_items:
                # Only process movies
                if hasattr(item, 'TYPE') and item.TYPE == 'movie':
                    try:
                        movie_data = {
                            'title': item.title,
                            'year': getattr(item, 'year', None),
                            'imdb_id': None,
                            'tmdb_id': None,
                            'rating_key': getattr(item, 'ratingKey', None)
                        }
                        
                        # Extract IDs from guid
                        if hasattr(item, 'guid'):
                            guid = item.guid
                            if 'imdb://' in guid:
                                movie_data['imdb_id'] = guid.split('imdb://')[1].split('?')[0]
                            elif 'tmdb://' in guid:
                                movie_data['tmdb_id'] = guid.split('tmdb://')[1].split('?')[0]
                        
                        movies.append(movie_data)
                        logger.debug(f"Found watchlist movie: {movie_data['title']} ({movie_data['year']})")
                        
                    except Exception as e:
                        logger.warning(f"Error processing watchlist item {item}: {e}")
                        continue
                        
        except Exception as e:
            logger.error(f"Failed to get watchlist: {e}")
            
        logger.info(f"Found {len(movies)} movies in watchlist")
        return movies

    def get_movie_libraries(self) -> List[Dict]:
        """Get available movie libraries as fallback"""
        libraries = []
        
        try:
            for section in self.server.library.sections():
                if section.type == 'movie':
                    libraries.append({
                        'title': section.title,
                        'key': section.key
                    })
                    
        except Exception as e:
            logger.error(f"Failed to get movie libraries: {e}")
            
        return libraries

    def get_recently_added_movies(self, limit: int = 50) -> List[Dict]:
        """Get recently added movies as fallback for watchlist"""
        movies = []
        
        try:
            movie_sections = [s for s in self.server.library.sections() if s.type == 'movie']
            
            for section in movie_sections:
                try:
                    recent_movies = section.recentlyAdded(maxresults=limit)
                    
                    for movie in recent_movies:
                        try:
                            movie_data = {
                                'title': movie.title,
                                'year': getattr(movie, 'year', None),
                                'imdb_id': None,
                                'tmdb_id': None,
                                'rating_key': movie.ratingKey
                            }
                            
                            # Extract IDs from guid
                            if hasattr(movie, 'guid'):
                                guid = movie.guid
                                if 'imdb://' in guid:
                                    movie_data['imdb_id'] = guid.split('imdb://')[1].split('?')[0]
                                elif 'tmdb://' in guid:
                                    movie_data['tmdb_id'] = guid.split('tmdb://')[1].split('?')[0]
                            
                            movies.append(movie_data)
                            
                        except Exception as e:
                            logger.warning(f"Error processing movie {movie}: {e}")
                            continue
                            
                except Exception as e:
                    logger.warning(f"Error getting recently added from section {section.title}: {e}")
                    continue
                    
        except Exception as e:
            logger.error(f"Failed to get recently added movies: {e}")
            
        logger.info(f"Found {len(movies)} recently added movies as fallback")
        return movies


class RadarrAPI:
    """Interface for Radarr API operations"""
    
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({
            'X-Api-Key': api_key,
            'Content-Type': 'application/json'
        })

    def get_movies(self) -> List[Dict]:
        """Get all movies from Radarr"""
        try:
            response = self.session.get(f"{self.base_url}/api/v3/movie")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to get movies from Radarr: {e}")
            return []

    def get_quality_profiles(self) -> List[Dict]:
        """Get available quality profiles"""
        try:
            response = self.session.get(f"{self.base_url}/api/v3/qualityprofile")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to get quality profiles: {e}")
            return []

    def find_movie(self, title: str, year: Optional[int] = None, 
                   imdb_id: Optional[str] = None, tmdb_id: Optional[str] = None) -> Optional[Dict]:
        """Find a movie in Radarr by various identifiers"""
        movies = self.get_movies()
        
        for movie in movies:
            # Check by IMDB ID first (most reliable)
            if imdb_id and movie.get('imdbId') == imdb_id:
                return movie
                
            # Check by TMDB ID
            if tmdb_id and str(movie.get('tmdbId')) == str(tmdb_id):
                return movie
                
            # Check by title and year
            if (movie.get('title', '').lower() == title.lower() and
                    movie.get('year') == year):
                return movie
                
        return None

    def update_movie_profile(self, movie_id: int, profile_id: int) -> bool:
        """Update a movie's quality profile"""
        try:
            # First get the current movie data
            response = self.session.get(f"{self.base_url}/api/v3/movie/{movie_id}")
            response.raise_for_status()
            movie_data = response.json()
            
            # Update the quality profile
            movie_data['qualityProfileId'] = profile_id
            
            # Send the update
            response = self.session.put(
                f"{self.base_url}/api/v3/movie/{movie_id}",
                json=movie_data
            )
            response.raise_for_status()
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to update movie profile: {e}")
            return False


class PlexRadarrUpdater:
    """Main application class"""
    
    def __init__(self, config_path: str = "config.yaml"):
        self.config = self.load_config(config_path)
        self.plex = None
        self.radarr = None
        self.target_profile_id = None
        
        self.setup_apis()

    def load_config(self, config_path: str) -> Dict:
        """Load configuration from file or environment variables"""
        config = {}
        
        # Try to load from config file first
        config_file = Path(config_path)
        if config_file.exists():
            with open(config_file, 'r') as f:
                config = yaml.safe_load(f) or {}
        
        # Override with environment variables
        plex_config = config.get('plex', {})
        plex_config['url'] = os.getenv('PLEX_URL', plex_config.get('url', ''))
        plex_config['token'] = os.getenv('PLEX_TOKEN', plex_config.get('token', ''))
        
        radarr_config = config.get('radarr', {})
        radarr_config['url'] = os.getenv('RADARR_URL', radarr_config.get('url', ''))
        radarr_config['api_key'] = os.getenv('RADARR_API_KEY', radarr_config.get('api_key', ''))
        
        config['plex'] = plex_config
        config['radarr'] = radarr_config
        config['target_profile'] = os.getenv('TARGET_PROFILE', config.get('target_profile', 'HD-1080p'))
        
        return config

    def setup_apis(self):
        """Initialize API connections"""
        try:
            # Setup Plex API
            plex_config = self.config['plex']
            if not plex_config.get('url') or not plex_config.get('token'):
                raise ValueError("Plex URL and token are required")
                
            self.plex = PlexAPI(plex_config['url'], plex_config['token'])

            # Setup Radarr API
            radarr_config = self.config['radarr']
            if not radarr_config.get('url') or not radarr_config.get('api_key'):
                raise ValueError("Radarr URL and API key are required")
                
            self.radarr = RadarrAPI(radarr_config['url'], radarr_config['api_key'])

            # Find target quality profile
            profiles = self.radarr.get_quality_profiles()
            target_profile_name = self.config['target_profile']
            
            for profile in profiles:
                if profile['name'] == target_profile_name:
                    self.target_profile_id = profile['id']
                    break
                    
            if not self.target_profile_id:
                available_profiles = [p['name'] for p in profiles]
                raise ValueError(f"Target profile '{target_profile_name}' not found. "
                                 f"Available profiles: {available_profiles}")
                               
            logger.info(f"Target profile: {target_profile_name} (ID: {self.target_profile_id})")
            
        except Exception as e:
            logger.error(f"Failed to setup APIs: {e}")
            raise

    def process_watchlist(self) -> int:
        """Process watchlist and update profiles"""
        updates_made = 0
        
        # Get watchlist movies
        watchlist_movies = self.plex.get_watchlist()
        

        # If no watchlist movies, try recently added as fallback
        if not watchlist_movies:
            logger.warning("No watchlist movies found, quitting")
            exit()
            
        if not watchlist_movies:
            logger.warning("No movies found to process")
            return updates_made
            
        logger.info(f"Processing {len(watchlist_movies)} movies")
        
        for movie in watchlist_movies:
            try:
                # Find movie in Radarr
                radarr_movie = self.radarr.find_movie(
                    title=movie['title'],
                    year=movie['year'],
                    imdb_id=movie['imdb_id'],
                    tmdb_id=movie['tmdb_id']
                )
                
                if not radarr_movie:
                    logger.info(f"Movie not found in Radarr: {movie['title']} ({movie['year']})")
                    continue
                    
                current_profile_id = radarr_movie.get('qualityProfileId')
                
                # Check if update is needed
                if current_profile_id == self.target_profile_id:
                    logger.debug(f"Movie already has target profile: {movie['title']}")
                    continue
                    
                # Update the profile
                if self.radarr.update_movie_profile(radarr_movie['id'], self.target_profile_id):
                    logger.info(f"Updated profile for: {movie['title']} ({movie['year']})")
                    updates_made += 1
                else:
                    logger.error(f"Failed to update profile for: {movie['title']}")
                    
            except Exception as e:
                logger.error(f"Error processing movie {movie['title']}: {e}")
                continue
                
        return updates_made

    def run_once(self) -> int:
        """Run the updater once"""
        logger.info("Starting Plex watchlist to Radarr profile update")
        
        try:
            updates_made = self.process_watchlist()
            logger.info(f"Update complete. {updates_made} movies updated.")
            return updates_made
            
        except Exception as e:
            logger.error(f"Error during update process: {e}")
            return 0

    def run_continuous(self, interval_minutes: int = 60):
        """Run the updater continuously"""
        logger.info(f"Starting continuous monitoring (checking every {interval_minutes} minutes)")
        
        while True:
            try:
                self.run_once()
                
            except KeyboardInterrupt:
                logger.info("Received interrupt signal, stopping...")
                break
            except Exception as e:
                logger.error(f"Unexpected error: {e}")
                
            logger.info(f"Sleeping for {interval_minutes} minutes...")
            time.sleep(interval_minutes * 60)


def start_health_server(port: int = 8080):
    """Start health check server in background thread"""
    def run_server():
        try:
            server = HTTPServer(('', port), HealthCheckHandler)
            logger.info(f"Health check server started on port {port}")
            server.serve_forever()
        except Exception as e:
            logger.error(f"Failed to start health server: {e}")
    
    thread = threading.Thread(target=run_server, daemon=True)
    thread.start()


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Plex Watchlist to Radarr Profile Updater')
    parser.add_argument('--config', default='config.yaml',
                        help='Configuration file path')
    parser.add_argument('--once', action='store_true',
                        help='Run once and exit')
    parser.add_argument('--interval', type=int, default=60,
                        help='Check interval in minutes (default: 60)')
    parser.add_argument('--health-port', type=int, default=8080,
                        help='Health check server port (default: 8080)')
    
    args = parser.parse_args()
    
    try:
        # Start health check server
        start_health_server(args.health_port)
        
        # Initialize updater
        updater = PlexRadarrUpdater(args.config)
        
        if args.once:
            updater.run_once()
        else:
            updater.run_continuous(args.interval)
            
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        exit(1)


if __name__ == "__main__":
    main() 