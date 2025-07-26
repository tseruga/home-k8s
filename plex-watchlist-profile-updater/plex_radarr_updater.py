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
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status": "healthy"}')
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        # Suppress default HTTP server logging
        pass


def start_health_server():
    """Start health check server in background thread"""
    try:
        server = HTTPServer(('0.0.0.0', 8080), HealthCheckHandler)
        server.serve_forever()
    except Exception as e:
        logger.warning(f"Health check server failed to start: {e}")


class PlexAPI:
    """Interface for Plex API operations"""
    
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip('/')
        self.token = token
        self.session = requests.Session()
        self.session.headers.update({
            'X-Plex-Token': token,
            'Accept': 'application/json'
        })
    
    def get_watchlist(self, user_id: Optional[str] = None) -> List[Dict]:
        """Get movies from Plex watchlist"""
        try:
            # First get user info if user_id not provided
            if not user_id:
                user_info = self.session.get(f"{self.base_url}/user")
                user_info.raise_for_status()
                user_data = user_info.json()
                user_id = user_data.get('MyPlex', {}).get('id')
            
            # Get watchlist
            watchlist_url = f"{self.base_url}/hubs/watchlist"
            response = self.session.get(watchlist_url)
            response.raise_for_status()
            
            watchlist_data = response.json()
            movies = []
            
            # Extract movie information
            for hub in watchlist_data.get('MediaContainer', {}).get('Hub', []):
                if hub.get('type') == 'movie':
                    for item in hub.get('Metadata', []):
                        movie_info = {
                            'title': item.get('title'),
                            'year': item.get('year'),
                            'imdb_id': None,
                            'tmdb_id': None,
                            'plex_key': item.get('key')
                        }
                        
                        # Extract external IDs
                        for guid in item.get('Guid', []):
                            guid_id = guid.get('id', '')
                            if 'imdb://' in guid_id:
                                movie_info['imdb_id'] = guid_id.replace('imdb://', '')
                            elif 'tmdb://' in guid_id:
                                movie_info['tmdb_id'] = guid_id.replace('tmdb://', '')
                        
                        movies.append(movie_info)
            
            logger.info(f"Found {len(movies)} movies in watchlist")
            return movies
            
        except requests.RequestException as e:
            logger.error(f"Error fetching Plex watchlist: {e}")
            return []


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
    
    def get_quality_profiles(self) -> List[Dict]:
        """Get available quality profiles from Radarr"""
        try:
            response = self.session.get(f"{self.base_url}/api/v3/qualityprofile")
            response.raise_for_status()
            profiles = response.json()
            logger.info(f"Found {len(profiles)} quality profiles in Radarr")
            return profiles
        except requests.RequestException as e:
            logger.error(f"Error fetching quality profiles: {e}")
            return []
    
    def get_movies(self) -> List[Dict]:
        """Get all movies from Radarr"""
        try:
            response = self.session.get(f"{self.base_url}/api/v3/movie")
            response.raise_for_status()
            movies = response.json()
            logger.info(f"Found {len(movies)} movies in Radarr")
            return movies
        except requests.RequestException as e:
            logger.error(f"Error fetching movies from Radarr: {e}")
            return []
    
    def update_movie_profile(self, movie_id: int, quality_profile_id: int) -> bool:
        """Update a movie's quality profile"""
        try:
            # First get the current movie data
            response = self.session.get(f"{self.base_url}/api/v3/movie/{movie_id}")
            response.raise_for_status()
            movie_data = response.json()
            
            # Update the quality profile
            movie_data['qualityProfileId'] = quality_profile_id
            
            # Send the update
            update_response = self.session.put(
                f"{self.base_url}/api/v3/movie/{movie_id}",
                json=movie_data
            )
            update_response.raise_for_status()
            
            logger.info(f"Updated movie '{movie_data.get('title')}' to quality profile ID {quality_profile_id}")
            return True
            
        except requests.RequestException as e:
            logger.error(f"Error updating movie profile: {e}")
            return False
    
    def find_movie_by_identifiers(self, title: str, year: int, imdb_id: str = None, tmdb_id: str = None) -> Optional[Dict]:
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
            if (movie.get('title', '').lower() == title.lower() and movie.get('year') == year):
                return movie
        
        return None


class PlexRadarrUpdater:
    """Main class that coordinates Plex and Radarr updates"""
    
    def __init__(self, config_path: str = 'config.yaml'):
        self.config = self.load_config(config_path)
        
        # Get credentials from environment variables or config file
        plex_url = os.getenv('PLEX_URL') or self.config['plex']['url']
        plex_token = os.getenv('PLEX_TOKEN') or self.config['plex']['token']
        radarr_url = os.getenv('RADARR_URL') or self.config['radarr']['url'] 
        radarr_api_key = os.getenv('RADARR_API_KEY') or self.config['radarr']['api_key']
        
        if not all([plex_url, plex_token, radarr_url, radarr_api_key]):
            raise ValueError("Missing required configuration. Check environment variables or config.yaml")
        
        self.plex = PlexAPI(plex_url, plex_token)
        self.radarr = RadarrAPI(radarr_url, radarr_api_key)
        
        # Get the target quality profile ID
        profiles = self.radarr.get_quality_profiles()
        target_profile_name = os.getenv('TARGET_PROFILE') or self.config.get('target_profile', 'HD-1080p')
        self.target_profile_id = None
        
        for profile in profiles:
            if profile['name'] == target_profile_name:
                self.target_profile_id = profile['id']
                break
        
        if not self.target_profile_id:
            logger.error(f"Target profile '{target_profile_name}' not found!")
            available_profiles = [p['name'] for p in profiles]
            logger.error(f"Available profiles: {available_profiles}")
            raise ValueError(f"Profile '{target_profile_name}' not found")
        
        logger.info(f"Using target profile: {target_profile_name} (ID: {self.target_profile_id})")
    
    def load_config(self, config_path: str) -> Dict:
        """Load configuration from YAML file"""
        config_file = Path(config_path)
        if not config_file.exists():
            logger.warning(f"Configuration file {config_path} not found, using environment variables only")
            return {}
        
        with open(config_file, 'r') as f:
            config = yaml.safe_load(f)
        
        return config or {}
    
    def process_watchlist(self):
        """Main method to process watchlist and update profiles"""
        logger.info("Starting watchlist processing...")
        
        # Get watchlist from Plex
        watchlist_movies = self.plex.get_watchlist()
        if not watchlist_movies:
            logger.info("No movies found in watchlist")
            return
        
        updated_count = 0
        not_found_count = 0
        
        for movie in watchlist_movies:
            title = movie['title']
            year = movie['year']
            imdb_id = movie['imdb_id']
            tmdb_id = movie['tmdb_id']
            
            logger.info(f"Processing: {title} ({year})")
            
            # Find movie in Radarr
            radarr_movie = self.radarr.find_movie_by_identifiers(
                title, year, imdb_id, tmdb_id
            )
            
            if not radarr_movie:
                logger.warning(f"Movie '{title} ({year})' not found in Radarr")
                not_found_count += 1
                continue
            
            # Check if profile needs updating
            current_profile_id = radarr_movie.get('qualityProfileId')
            if current_profile_id == self.target_profile_id:
                logger.info(f"Movie '{title}' already has target profile")
                continue
            
            # Update the profile
            if self.radarr.update_movie_profile(radarr_movie['id'], self.target_profile_id):
                updated_count += 1
            
            # Add small delay to avoid overwhelming the APIs
            time.sleep(0.5)
        
        logger.info(f"Processing complete. Updated: {updated_count}, Not found: {not_found_count}")
    
    def run_continuous(self, interval_minutes: int = 60):
        """Run the updater continuously with specified interval"""
        logger.info(f"Starting continuous mode with {interval_minutes} minute intervals")
        
        while True:
            try:
                self.process_watchlist()
                logger.info(f"Sleeping for {interval_minutes} minutes...")
                time.sleep(interval_minutes * 60)
            except KeyboardInterrupt:
                logger.info("Received interrupt signal, stopping...")
                break
            except Exception as e:
                logger.error(f"Unexpected error: {e}")
                time.sleep(300)  # Wait 5 minutes before retrying


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Plex Watchlist to Radarr Profile Updater')
    parser.add_argument('--config', default='config.yaml', help='Configuration file path')
    parser.add_argument('--continuous', action='store_true', help='Run continuously')
    parser.add_argument('--interval', type=int, default=60, help='Interval in minutes for continuous mode')
    
    args = parser.parse_args()
    
    # Start health check server in background for Kubernetes
    if args.continuous:
        health_thread = threading.Thread(target=start_health_server, daemon=True)
        health_thread.start()
        logger.info("Health check server started on port 8080")
    
    try:
        updater = PlexRadarrUpdater(args.config)
        
        if args.continuous:
            updater.run_continuous(args.interval)
        else:
            updater.process_watchlist()
            
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        return 1
    
    return 0


if __name__ == '__main__':
    exit(main()) 