# Plex Watchlist to Radarr Profile Updater

This Python script automatically monitors your Plex watchlist and updates the quality profile in Radarr for movies on your watchlist to a higher quality setting.

## Features

- 🎬 Monitors Plex watchlist for new movies
- 🔄 Automatically updates Radarr quality profiles
- 🔍 Matches movies using IMDB ID, TMDB ID, title, and year
- 📊 Comprehensive logging and error handling
- ⏰ Supports both one-time runs and continuous monitoring
- ⚙️ Configurable quality profile targets

## Prerequisites

- Python 3.7 or higher
- Access to your Plex server
- Access to your Radarr server
- API tokens for both services

## Installation

1. Clone or navigate to this directory:
```bash
cd plex-watchlist-profile-updater
```

2. Install required dependencies:
```bash
pip install -r requirements.txt
```

3. Configure the script by editing `config.yaml`

## Configuration

### Getting API Tokens

#### Plex Token
1. Log into your Plex server web interface
2. Go to Settings → Account → Privacy & Online Services
3. Find your "X-Plex-Token" or follow [this guide](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/)

#### Radarr API Key
1. Open Radarr web interface
2. Go to Settings → General
3. Copy the "API Key" value

### Configuration File

Edit `config.yaml` with your specific settings:

```yaml
# Plex server configuration
plex:
  url: "http://192.168.1.210:32400"  # Your Plex server URL
  token: "YOUR_PLEX_TOKEN_HERE"      # Your Plex token

# Radarr server configuration  
radarr:
  url: "http://192.168.1.211:7878"   # Your Radarr server URL
  api_key: "YOUR_RADARR_API_KEY_HERE" # Your Radarr API key

# Target quality profile name to upgrade movies to
target_profile: "HD-1080p"
```

### Quality Profile Names

Make sure the `target_profile` matches exactly with a profile name in your Radarr. Common profile names include:
- `HD-720p/1080p`
- `HD-1080p`
- `Ultra-HD`
- `Any`

You can check your available profiles by running the script once - it will log all available profiles if the target isn't found.

## Usage

### One-time Run
Process your current watchlist once:
```bash
python plex_radarr_updater.py
```

### Continuous Monitoring
Run continuously, checking every hour:
```bash
python plex_radarr_updater.py --continuous
```

Run continuously with custom interval (e.g., every 30 minutes):
```bash
python plex_radarr_updater.py --continuous --interval 30
```

### Custom Configuration File
Use a different configuration file:
```bash
python plex_radarr_updater.py --config /path/to/custom_config.yaml
```

## How It Works

1. **Fetch Watchlist**: Connects to Plex and retrieves all movies from your watchlist
2. **Match Movies**: For each watchlist movie, searches Radarr using:
   - IMDB ID (most reliable)
   - TMDB ID
   - Title and year combination
3. **Update Profiles**: If a movie is found in Radarr and doesn't already have the target profile, updates it
4. **Logging**: Logs all actions, successes, and failures

## Logging

The script creates detailed logs in `plex_radarr_updater.log` and also outputs to the console. Log levels include:
- **INFO**: Normal operations and status updates
- **WARNING**: Movies not found in Radarr
- **ERROR**: API failures or configuration issues

## Troubleshooting

### Common Issues

1. **"Target profile not found"**
   - Check your Radarr quality profile names
   - Update `target_profile` in config.yaml to match exactly

2. **"Configuration file not found"**
   - Ensure `config.yaml` exists in the same directory
   - Use `--config` flag to specify different location

3. **"Movies not found in Radarr"**
   - Movies must already exist in Radarr for profile updates
   - Consider adding movies to Radarr first, then running the script

4. **API Connection Errors**
   - Verify server URLs are accessible
   - Check that API tokens are correct and have proper permissions
   - Ensure servers are running and responsive

### Debug Mode

For more detailed logging, you can modify the logging level in the script or run with Python's verbose flag:
```bash
python -v plex_radarr_updater.py
```

## Automation

### Running as a Service (Linux/macOS)

You can set this up as a systemd service or cron job for automated execution:

#### Cron Example (run every hour):
```bash
# Edit crontab
crontab -e

# Add this line to run every hour
0 * * * * cd /path/to/plex-watchlist-profile-updater && python plex_radarr_updater.py
```

#### Systemd Service Example:
Create `/etc/systemd/system/plex-watchlist-updater.service`:
```ini
[Unit]
Description=Plex Watchlist to Radarr Profile Updater
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/plex-watchlist-profile-updater
ExecStart=/usr/bin/python3 plex_radarr_updater.py --continuous
Restart=always

[Install]
WantedBy=multi-user.target
```

Then enable and start:
```bash
sudo systemctl enable plex-watchlist-updater.service
sudo systemctl start plex-watchlist-updater.service
```

## Security Notes

- Keep your API tokens secure and don't share them
- Consider using environment variables for sensitive data
- The script only reads from Plex and updates quality profiles in Radarr - it doesn't download or modify media files

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve this script.

## License

This project is provided as-is for personal use. Use at your own risk. 