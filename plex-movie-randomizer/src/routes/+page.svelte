<script lang="ts">
  import { onMount } from 'svelte';
  import { Film, Settings, Shuffle, ExternalLink, Calendar, Star } from 'lucide-svelte';

  interface Movie {
    title: string;
    year?: number;
    summary?: string;
    rating?: number;
    poster?: string;
    guid?: string;
    key?: string;
    ratingKey?: string; // Required for detailed metadata fetching
    duration?: number; // in minutes
    genres?: string[]; // Array of genre names
  }

  interface PlexConfig {
    baseUrl: string;
    token: string;
  }

  // Add authentication state interfaces
  interface PlexPinResponse {
    id: number;
    code: string;
    product: string;
    trusted: boolean;
    qr: string;
    clientIdentifier: string;
    expiresIn: number;
    createdAt: string;
    expiresAt: string;
    authToken: string | null;
    newRegistration: boolean | null;
  }

  interface PlexAuthState {
    isAuthenticating: boolean;
    authError: string;
    isAuthenticated: boolean;
    currentPin: string;
  }

  let config: PlexConfig = {
    baseUrl: '',
    token: ''
  };

  // Add authentication state
  let authState: PlexAuthState = {
    isAuthenticating: false,
    authError: '',
    isAuthenticated: false,
    currentPin: ''
  };

  let movies: Movie[] = [];
  let selectedMovie: Movie | null = null;
  let loading = false;
  let error = '';
  let showConfig = false;
  let imagesLoaded = false;
  let loadingImages = false;
  let imageLoadProgress = 0;
  let isSpinning = false;
  let spinningMovies: Movie[] = [];
  let slotMachineContainer: HTMLElement;
  let selectedMovieIndex = 0;
  let showWinnerPause = false;
  let loadingGenres = false;
  let genreLoadProgress = 0;
  
  // Filter state
  let showFilters = false;
  let filters = {
    maxDuration: 0, // 0 means no limit
    minRating: 0, // 0 means no limit
    excludedGenres: [] as string[] // Array of genres to exclude
  };
  
  let filteredMovies: Movie[] = [];
  let availableGenres: string[] = []; // List of all available genres

  // Generate a unique client identifier for this app instance
  const CLIENT_ID = 'plex-movie-randomizer-' + crypto.randomUUID();
  const APP_NAME = 'Plex Movie Randomizer';

  // Load config from localStorage on mount
  onMount(() => {
    const savedConfig = localStorage.getItem('plexConfig');
    if (savedConfig) {
      config = JSON.parse(savedConfig);
      authState.isAuthenticated = !!config.token;
    } else {
      showConfig = true;
    }
  });

  // Plex PIN Authentication Functions
  async function requestPlexPIN(): Promise<PlexPinResponse> {
    console.log('Requesting PIN from Plex with client ID:', CLIENT_ID);
    
    const response = await fetch('https://plex.tv/api/v2/pins', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'X-Plex-Client-Identifier': CLIENT_ID,
        'X-Plex-Product': APP_NAME,
        'X-Plex-Device': 'Web Browser',
        'X-Plex-Version': '1.0.0',
        'X-Plex-Platform': 'Web',
        'X-Plex-Device-Name': 'Plex Movie Randomizer'
      }
      // No body - use default PIN generation (should be 4 digits)
    });

    if (!response.ok) {
      throw new Error(`Failed to request PIN: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('PIN request successful:', data);
    return data;
  }

  async function checkPINStatus(pinId: number): Promise<PlexPinResponse> {
    const response = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Plex-Client-Identifier': CLIENT_ID,
        'X-Plex-Product': APP_NAME,
        'X-Plex-Device': 'Web Browser',
        'X-Plex-Version': '1.0.0',
        'X-Plex-Platform': 'Web',
        'X-Plex-Device-Name': 'Plex Movie Randomizer'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to check PIN status: ${response.status} ${response.statusText}`);
    }

    const responseText = await response.text();
    console.log(`Raw PIN status response:`, responseText);

    try {
      const data = JSON.parse(responseText);
      return data;
    } catch (parseError) {
      console.error('Failed to parse PIN status response:', parseError);
      console.error('Response text was:', responseText);
      throw new Error('Invalid JSON response from Plex PIN status endpoint');
    }
  }

  function getPlexAuthURL(pinCode: string): string {
    // Try the traditional plex.tv/link approach instead of app.plex.tv/auth
    // This is the method that many working implementations use
    console.log('Using PIN code for authentication:', pinCode);
    return `https://plex.tv/link?pin=${pinCode}`;
  }

  async function loginWithPlex() {
    authState.isAuthenticating = true;
    authState.authError = '';
    let authWindow: Window | null = null;
    let pollInterval: NodeJS.Timeout | null = null;

    try {
      console.log('Initiating Plex PIN authentication...');
      
      // Request PIN from Plex
      const pinData = await requestPlexPIN();
      console.log('PIN received:', pinData.code);

      // Create auth URL and open popup
      const authURL = getPlexAuthURL(pinData.code);
      
      // Store the PIN code to show to the user
      authState.currentPin = pinData.code;
      authState.authError = ''; // Clear any previous errors
      
      authWindow = window.open(
        authURL, 
        'plexAuth', 
        'width=600,height=700,scrollbars=yes,resizable=yes,status=yes,location=yes,toolbar=no,menubar=no'
      );

      if (!authWindow) {
        throw new Error('Failed to open authentication window. Please allow popups for this site.');
      }

      // Poll for authentication completion
      const startTime = Date.now();
      const timeout = Math.min(pinData.expiresIn * 1000, 300000); // Max 5 minutes
      let pollAttempts = 0;
      const maxPollAttempts = 150; // 5 minutes at 2-second intervals

      console.log(`Starting polling for PIN ${pinData.id}, expires in ${pinData.expiresIn} seconds`);

      pollInterval = setInterval(async () => {
        pollAttempts++;
        
        try {
          // Check if window was closed by user
          if (authWindow?.closed) {
            console.log('Auth window was closed by user');
            clearInterval(pollInterval!);
            authState.isAuthenticating = false;
            authState.currentPin = ''; // Clear the PIN display
            authState.authError = 'Authentication cancelled by user';
            return;
          }

          // Check if the popup has been redirected to our forward URL (indicates success)
          try {
            const popupUrl = authWindow?.location?.href;
            if (popupUrl && popupUrl.includes(window.location.origin)) {
              console.log('Popup redirected to forward URL, authentication likely successful');
              // Give it a moment for the authToken to be available, then check PIN status
              setTimeout(async () => {
                try {
                  const status = await checkPINStatus(pinData.id);
                  if (status.authToken) {
                    console.log('Authentication confirmed via redirect detection!');
                    clearInterval(pollInterval!);
                    authWindow?.close();
                    
                    config.token = status.authToken;
                    authState.isAuthenticated = true;
                    authState.isAuthenticating = false;
                    localStorage.setItem('plexConfig', JSON.stringify(config));
                    showConfig = false;
                    await fetchWatchlist();
                  }
                } catch (err) {
                  console.log('Redirect detected but token not ready yet, continuing polling...');
                }
              }, 1000);
            }
          } catch (urlError) {
            // Cross-origin restrictions prevent reading popup URL - this is normal
          }

          // Check if we've exceeded the timeout or max attempts
          if (Date.now() - startTime > timeout || pollAttempts > maxPollAttempts) {
            console.log(`Authentication timeout: ${Date.now() - startTime}ms elapsed, ${pollAttempts} attempts`);
            clearInterval(pollInterval!);
            authWindow?.close();
            authState.isAuthenticating = false;
            authState.currentPin = ''; // Clear the PIN display
            authState.authError = 'Authentication timed out. Please try again.';
            return;
          }

          console.log(`Polling attempt ${pollAttempts} for PIN status...`);

          // Check PIN status
          const status = await checkPINStatus(pinData.id);
          console.log(`PIN status response:`, status);
          
          if (status.authToken) {
            // Success! We have the token
            console.log('Authentication successful! Token received:', status.authToken.substring(0, 10) + '...');
            clearInterval(pollInterval!);
            authWindow?.close();
            
            // Save the token
            config.token = status.authToken;
            authState.isAuthenticated = true;
            authState.isAuthenticating = false;
            authState.currentPin = ''; // Clear the PIN display
            
            // Save to localStorage
            localStorage.setItem('plexConfig', JSON.stringify(config));
            
            console.log('Token saved, loading watchlist...');
            
            // Hide config panel and load watchlist
            showConfig = false;
            await fetchWatchlist();
          } else {
            console.log(`Polling attempt ${pollAttempts}: No token yet, continuing...`);
          }
        } catch (pollError) {
          console.warn(`Error during polling attempt ${pollAttempts}:`, pollError);
          
          // If we get multiple consecutive errors, fail the authentication
          if (pollError instanceof Error && pollError.message.includes('401')) {
            console.error('PIN authentication failed - unauthorized');
            clearInterval(pollInterval!);
            authWindow?.close();
            authState.isAuthenticating = false;
            authState.currentPin = ''; // Clear the PIN display
            authState.authError = 'Authentication failed. Please try again.';
            return;
          }
          
          // Continue polling for other errors (network issues, etc.)
        }
              }, 1000); // Poll every 1 second for faster detection

    } catch (error) {
      console.error('Authentication error:', error);
      authState.authError = error instanceof Error ? error.message : 'Authentication failed. Please try again.';
      authState.isAuthenticating = false;
      authState.currentPin = ''; // Clear the PIN display
      
      if (authWindow) {
        authWindow.close();
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    }
  }

  function logout() {
    config.token = '';
    authState.isAuthenticated = false;
    authState.authError = '';
    authState.currentPin = ''; // Clear the PIN display
    movies = [];
    selectedMovie = null;
    filteredMovies = [];
    imagesLoaded = false;
    localStorage.removeItem('plexConfig');
    showConfig = true;
  }

  function saveConfig() {
    localStorage.setItem('plexConfig', JSON.stringify(config));
    showConfig = false;
    if (config.token) {
      fetchWatchlist();
    }
  }

  async function fetchWatchlist() {
    if (!config.token) {
      error = 'Authentication required. Please login with Plex first.';
      authState.isAuthenticated = false;
      showConfig = true;
      return;
    }

    loading = true;
    error = '';
    movies = [];
    imagesLoaded = false;

    try {
      // Connect to plex.tv to get user's watchlist (watchlists are stored in the cloud, not on local server)
      console.log('Fetching watchlist from plex.tv using proper myPlex API...');

      const allMovies: Movie[] = [];
      let start = 0;
      const size = 50; // Fetch in batches of 50
      let hasMore = true;

      while (hasMore) {
        console.log(`Fetching batch starting at ${start}...`);
        
        // Use the proper plex.tv watchlist endpoint
        const watchlistUrl = new URL('https://metadata.provider.plex.tv/library/sections/watchlist/all');
        watchlistUrl.searchParams.set('X-Plex-Token', config.token);
        watchlistUrl.searchParams.set('X-Plex-Container-Start', start.toString());
        watchlistUrl.searchParams.set('X-Plex-Container-Size', size.toString());
        watchlistUrl.searchParams.set('libtype', 'movie'); // Filter for movies only
        watchlistUrl.searchParams.set('includeExternalMedia', '1'); // Include external media
        
        const watchlistResponse = await fetch(watchlistUrl.toString(), {
          headers: {
            'Accept': 'application/json',
            'X-Plex-Token': config.token
          }
        });
        
        if (!watchlistResponse.ok) {
          if (watchlistResponse.status === 401) {
            // Token is invalid or expired, need to re-authenticate
            authState.isAuthenticated = false;
            authState.authError = 'Your Plex session has expired. Please login again.';
            config.token = '';
            localStorage.removeItem('plexConfig');
            throw new Error('Authentication expired. Please login again.');
          }
          throw new Error(`Failed to fetch watchlist from plex.tv: ${watchlistResponse.status} ${watchlistResponse.statusText}`);
        }

        const responseText = await watchlistResponse.text();
        let data;
        
        try {
          // Parse JSON response from plex.tv API
          data = JSON.parse(responseText);
        } catch (jsonError) {
          console.error('Failed to parse JSON response from plex.tv:', jsonError);
          throw new Error('Invalid response format from plex.tv. Please check your token and try again.');
        }

        const container = data.MediaContainer || data;
        const metadata = container.Metadata || [];
        const totalSize = container.totalSize || 0;
        
        console.log(`plex.tv API returned ${metadata.length} items in this batch (total: ${totalSize})`);
        
        // Debug: Log the first item's structure to see available fields
        if (metadata.length > 0) {
          console.log('Sample item data structure:', metadata[0]);
          console.log('Available fields:', Object.keys(metadata[0]));
          console.log('Item type:', metadata[0].type, 'Library type:', metadata[0].librarySectionType);
        }

        // Process each movie from the API response (basic data only)
        const batchMovies: Movie[] = metadata
          .filter((item: any) => {
            // Ensure we have a title and explicitly exclude TV shows
            if (!item.title) return false;
            
            // Additional safety filters to exclude TV shows
            if (item.type === 'show' || item.type === 'series') return false;
            if (item.librarySectionType === 'show') return false;
            if (item.Media && item.Media.some((media: any) => media.videoResolution && item.episodeCount)) return false;
            
            // Only include if it's explicitly a movie or has movie-like characteristics
            return item.type === 'movie' || 
                   item.librarySectionType === 'movie' || 
                   (!item.type && !item.episodeCount && !item.seasonCount);
          })
          .map((item: any) => {
            const movie: Movie = {
              title: item.title,
              year: item.year || undefined,
              summary: item.summary || '',
              rating: item.rating || item.audienceRating || undefined,
              guid: item.guid || '',
              key: item.key || '',
              ratingKey: item.ratingKey || '', // Store ratingKey
              duration: item.duration ? Math.round(item.duration / 60000) : undefined, // Convert from milliseconds to minutes
            };

            // Handle poster/thumbnail URL
            const thumb = item.thumb || item.art;
            if (thumb) {
              if (thumb.startsWith('http://') || thumb.startsWith('https://')) {
                // External URL (e.g., TMDB) - use directly
                movie.poster = thumb;
              } else if (config.baseUrl) {
                // Relative path - use local server if configured
                movie.poster = `${config.baseUrl}${thumb}?X-Plex-Token=${config.token}`;
              } else {
                // No local server configured, try to use the thumb as-is or construct plex.tv URL
                movie.poster = thumb.startsWith('/') ? `https://metadata.provider.plex.tv${thumb}?X-Plex-Token=${config.token}` : thumb;
              }
            }

            return movie;
          });

        // Log filtering results for debugging
        const originalCount = metadata.length;
        const filteredCount = batchMovies.length;
        if (originalCount !== filteredCount) {
          console.log(`Filtered ${originalCount - filteredCount} non-movie items from batch (${filteredCount} movies kept)`);
        }

        allMovies.push(...batchMovies);
        console.log(`Added ${batchMovies.length} movies. Total so far: ${allMovies.length}`);

        // Check if we should continue fetching
        const currentBatchSize = metadata.length;
        const hasItemsInBatch = currentBatchSize > 0;
        const totalFetched = start + currentBatchSize;
        const hasMoreBasedOnTotal = totalSize > 0 && totalFetched < totalSize;
        const underSafetyLimit = start < 1000; // Safety limit to prevent infinite loops

        console.log(`Pagination check: hasItems=${hasItemsInBatch}, totalFetched=${totalFetched}, totalSize=${totalSize}, hasMore=${hasMoreBasedOnTotal}`);

        if (hasItemsInBatch && hasMoreBasedOnTotal && underSafetyLimit) {
          start += currentBatchSize;
          console.log(`Continuing to next batch at ${start}...`);
        } else {
          hasMore = false;
          console.log(`Stopping pagination. Reason: hasItems=${hasItemsInBatch}, hasMore=${hasMoreBasedOnTotal}, underLimit=${underSafetyLimit}`);
        }
      }

      movies = allMovies;
      console.log(`Successfully loaded ${movies.length} movies from plex.tv watchlist`);
      
      if (movies.length === 0) {
        error = 'No movies found in your watchlist. Make sure you have movies added to your Plex watchlist at plex.tv.';
      } else {
        // Apply filters and preload images
        applyFilters();
        await preloadImages(filteredMovies.length > 0 ? filteredMovies : movies);
      }

    } catch (e) {
      console.error('Error fetching watchlist from plex.tv:', e);
      error = e instanceof Error ? e.message : 'Failed to fetch watchlist from plex.tv. Please check your authentication token.';
    } finally {
      loading = false;
    }
  }

  async function fetchGenresForMovies() {
    if (!config.baseUrl || !config.token || movies.length === 0) {
      error = 'Please configure your Plex server URL and ensure movies are loaded first.';
      return;
    }

    loadingGenres = true;
    genreLoadProgress = 0;
    error = '';

    try {
      console.log('Fetching detailed metadata including genres for movies...');
      
      let processedCount = 0;
      const updatedMovies = [...movies];

      // Process movies in batches to avoid overwhelming the server
      const batchSize = 5;
      for (let i = 0; i < movies.length; i += batchSize) {
        const batch = movies.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (movie, batchIndex) => {
          const globalIndex = i + batchIndex;
          
          try {
            // The ratingKey from plex.tv is actually a GUID, not the local server's ratingKey
            // We need to search the local server to find the movie and get its local ratingKey
            const plexGuid = movie.ratingKey || movie.guid;
            if (!plexGuid) {
              console.warn(`No GUID found for movie: ${movie.title}`);
              return;
            }

            console.log(`Searching local server for "${movie.title}" with GUID: ${plexGuid}`);

            // First, search the local server for this movie using its GUID
            const searchUrl = `${config.baseUrl}/search`;
            const searchParams = new URLSearchParams({
              'X-Plex-Token': config.token,
              'query': movie.title,
              'type': '1' // 1 = movies
            });
            
            console.log(`Searching: ${searchUrl}?${searchParams}`);
            
            const searchResponse = await fetch(`${searchUrl}?${searchParams}`, {
              headers: {
                'Accept': 'application/json',
                'X-Plex-Token': config.token
              }
            });

            if (!searchResponse.ok) {
              console.warn(`Failed to search for ${movie.title}: ${searchResponse.status} ${searchResponse.statusText}`);
              return;
            }

            const searchText = await searchResponse.text();
            const searchData = JSON.parse(searchText);
            const searchResults = searchData.MediaContainer?.Metadata || [];
            
            console.log(`Search results for "${movie.title}":`, searchResults);

            // Find a movie that matches by GUID or title
            const localMovie = searchResults.find((result: any) => {
              // Try to match by GUID first (most reliable)
              if (result.guid && (result.guid === plexGuid || result.guid === movie.guid)) {
                return true;
              }
              // Fallback to title matching if GUID doesn't match
              return result.title === movie.title;
            });

            if (!localMovie) {
              console.log(`Movie "${movie.title}" not found on local server`);
              return;
            }

            const localRatingKey = localMovie.ratingKey;
            console.log(`Found "${movie.title}" on local server with ratingKey: ${localRatingKey}`);

            // Now fetch detailed metadata using the local ratingKey
            const metadataUrl = `${config.baseUrl}/library/metadata/${localRatingKey}`;
            console.log(`Fetching metadata: ${metadataUrl}`);
            
            const response = await fetch(metadataUrl, {
              headers: {
                'Accept': 'application/json',
                'X-Plex-Token': config.token
              }
            });

            if (!response.ok) {
              console.warn(`Failed to fetch metadata for ${movie.title}: ${response.status} ${response.statusText}`);
              return;
            }

            const metadataText = await response.text();
            const metadataData = JSON.parse(metadataText);
            const movieMetadata = metadataData.MediaContainer?.Metadata?.[0];

            console.log(`Metadata response for "${movie.title}":`, movieMetadata);

            if (movieMetadata?.Genre && Array.isArray(movieMetadata.Genre)) {
              updatedMovies[globalIndex].genres = movieMetadata.Genre.map((g: any) => g.tag).filter(Boolean);
              console.log(`Found ${updatedMovies[globalIndex].genres?.length} genres for "${movie.title}":`, updatedMovies[globalIndex].genres);
            } else {
              console.log(`No genres found in metadata for "${movie.title}"`);
            }

          } catch (error) {
            console.warn(`Error fetching metadata for ${movie.title}:`, error);
          }

          processedCount++;
          genreLoadProgress = Math.round((processedCount / movies.length) * 100);
        }));

        // Small delay between batches to be gentle on the server
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Update the movies array with genre information
      movies = updatedMovies;

      // Build list of available genres from all movies
      const genreSet = new Set<string>();
      movies.forEach(movie => {
        if (movie.genres) {
          movie.genres.forEach(genre => genreSet.add(genre));
        }
      });
      availableGenres = Array.from(genreSet).sort();
      console.log(`Successfully loaded genres. Found ${availableGenres.length} unique genres:`, availableGenres);

      // Re-apply filters with new genre data
      applyFilters();

    } catch (e) {
      console.error('Error fetching movie genres:', e);
      error = e instanceof Error ? e.message : 'Failed to fetch movie genres from your Plex server.';
    } finally {
      loadingGenres = false;
      genreLoadProgress = 100;
    }
  }

  function applyFilters() {
    let filtered = [...movies];
    
    // Apply duration filter
    if (filters.maxDuration > 0) {
      filtered = filtered.filter(movie => !movie.duration || movie.duration <= filters.maxDuration);
    }
    
    // Apply rating filter
    if (filters.minRating > 0) {
      filtered = filtered.filter(movie => movie.rating && movie.rating >= filters.minRating);
    }
    
    // Apply genre exclusion filter
    if (filters.excludedGenres.length > 0) {
      filtered = filtered.filter(movie => {
        const movieGenres = movie.genres || [];
        return movieGenres.every(genre => !filters.excludedGenres.includes(genre));
      });
    }
    
    filteredMovies = filtered;
    console.log(`Applied filters: ${movies.length} total movies → ${filteredMovies.length} filtered movies`);
    
    // If we have images loaded, re-preload for the filtered set
    if (imagesLoaded && filteredMovies.length > 0) {
      preloadImages(filteredMovies);
    }
  }

  function selectRandomMovie() {
    const moviePool = filteredMovies.length > 0 ? filteredMovies : movies;
    if (moviePool.length === 0 || !imagesLoaded || isSpinning) return;
    
    // Clear previous selection
    selectedMovie = null;
    isSpinning = true;
    
    // Select random movie and index from filtered pool
    const randomIndex = Math.floor(Math.random() * moviePool.length);
    selectedMovieIndex = randomIndex;
    
    // Create spinning array with multiple copies to simulate infinite scroll
    // We need enough copies to make it look continuous and allow for spinning
    const copies = 5;
    spinningMovies = [];
    for (let i = 0; i < copies; i++) {
      spinningMovies.push(...moviePool);
    }
    
    // Start the slot machine animation after a brief delay
    setTimeout(() => {
      startSlotMachineAnimation();
    }, 100);
  }

  function startSlotMachineAnimation() {
    if (!slotMachineContainer) return;
    
    const moviePool = filteredMovies.length > 0 ? filteredMovies : movies;
    const itemWidth = 208; // Width of each movie poster (w-44 = 176px) + margin (16px each side = 32px) = 208px total
    const containerWidth = slotMachineContainer.parentElement?.clientWidth || 1200;
    const visibleItems = Math.floor(containerWidth / itemWidth);
    const centerPosition = Math.floor(visibleItems / 2);
    
    // Start from beginning
    slotMachineContainer.style.transform = `translateX(0px)`;
    slotMachineContainer.style.transition = 'none';
    
    // Calculate final position - we want the selected movie from the middle copy to be centered
    const middleCopyStartIndex = 2 * moviePool.length; // Third copy (0-indexed)
    const selectedMoviePositionInMiddleCopy = middleCopyStartIndex + selectedMovieIndex;
    const finalPosition = (selectedMoviePositionInMiddleCopy * itemWidth) - (centerPosition * itemWidth);
    
    // Add extra spins for dramatic effect
    const extraSpins = moviePool.length * itemWidth * 2; // Two extra full rotations
    const totalDistance = finalPosition + extraSpins;
    
    // Start animation after a brief delay
    requestAnimationFrame(() => {
      // Apply the spinning animation with PAINFULLY slow ending - maximum suspense!
      slotMachineContainer.style.transition = 'transform 12s cubic-bezier(0.25, 0, 0.001, 1)';
      slotMachineContainer.style.transform = `translateX(-${totalDistance}px)`;
      
      // After animation completes, show winner pause
      setTimeout(() => {
        showWinnerPause = true;
        
        // After showing the winner for a few seconds, reveal the full details
        setTimeout(() => {
          selectedMovie = moviePool[selectedMovieIndex];
          isSpinning = false;
          showWinnerPause = false;
        }, 2500); // Hold winner display for 2.5 seconds
      }, 12000); // Animation duration
    });
  }

  function clearSelection() {
    selectedMovie = null;
  }

  function formatRating(rating: number): string {
    return (rating / 2).toFixed(1); // Convert from 10-point to 5-point scale
  }



  async function preloadImages(movieList: Movie[]): Promise<void> {
    loadingImages = true;
    imageLoadProgress = 0;
    
    const moviesWithPosters = movieList.filter(movie => movie.poster);
    let loadedCount = 0;
    
    const imagePromises = moviesWithPosters.map(movie => {
      return new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          loadedCount++;
          imageLoadProgress = Math.round((loadedCount / moviesWithPosters.length) * 100);
          resolve();
        };
        img.onerror = () => {
          loadedCount++;
          imageLoadProgress = Math.round((loadedCount / moviesWithPosters.length) * 100);
          resolve(); // Continue even if image fails to load
        };
        img.src = movie.poster!;
      });
    });

    try {
      await Promise.all(imagePromises);
      console.log(`Preloaded ${imagePromises.length} movie posters`);
    } catch (error) {
      console.warn('Some images failed to preload:', error);
    } finally {
      imagesLoaded = true;
      loadingImages = false;
      imageLoadProgress = 100;
    }
  }
</script>

<main class="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white relative overflow-hidden">
  <!-- Animated background elements -->
  <div class="absolute inset-0 overflow-hidden pointer-events-none">
    <div class="absolute -top-1/2 -right-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
    <div class="absolute -bottom-1/2 -left-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-700"></div>
    <div class="absolute top-1/4 left-1/3 w-64 h-64 bg-pink-500/5 rounded-full blur-2xl animate-pulse delay-1000"></div>
  </div>

  <div class="container mx-auto px-4 py-8 relative z-10">
    <!-- Header -->
    <header class="text-center mb-12">
      <div class="flex items-center justify-center gap-4 mb-6">
        <div class="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-2xl">
          <Film size={48} class="text-white" />
        </div>
        <h1 class="text-5xl md:text-6xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent animate-gradient">
          Plex Movie Randomizer
        </h1>
      </div>
      <p class="text-gray-300 text-xl max-w-2xl mx-auto leading-relaxed">
        Discover your next movie night with a random selection from your Plex watchlist
      </p>
    </header>

    <!-- Authentication and Control Buttons -->
    <div class="flex justify-center gap-4 mb-8 flex-wrap">
      {#if !authState.isAuthenticated}
        <!-- Login with Plex Button -->
        <button
          on:click={loginWithPlex}
          disabled={authState.isAuthenticating}
          class="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-orange-600 to-yellow-600 hover:from-orange-700 hover:to-yellow-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 text-lg font-semibold"
        >
          {#if authState.isAuthenticating}
            <div class="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
            <span>Connecting to Plex...</span>
          {:else}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <span>Login with Plex</span>
          {/if}
        </button>
      {:else}
        <!-- Authenticated: Show Settings and Filter buttons -->
        <button
          on:click={() => showConfig = !showConfig}
          class="flex items-center gap-3 px-6 py-3 bg-gray-800/80 backdrop-blur-sm hover:bg-gray-700/80 rounded-xl transition-all duration-300 border border-gray-700/50 hover:border-gray-600/50 shadow-lg hover:shadow-xl hover:scale-105"
        >
          <Settings size={20} />
          <span class="font-medium">Settings</span>
        </button>
        
        {#if movies.length > 0}
          <button
            on:click={() => { showFilters = !showFilters; if (showFilters) applyFilters(); }}
            class="flex items-center gap-3 px-6 py-3 bg-purple-800/80 backdrop-blur-sm hover:bg-purple-700/80 rounded-xl transition-all duration-300 border border-purple-700/50 hover:border-purple-600/50 shadow-lg hover:shadow-xl hover:scale-105"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
            <span class="font-medium">Filters</span>
            {#if filteredMovies.length > 0 && filteredMovies.length < movies.length}
              <span class="bg-purple-600 text-white text-xs px-2 py-1 rounded-full">{filteredMovies.length}</span>
            {/if}
          </button>
        {/if}

        <!-- Logout Button -->
        <button
          on:click={logout}
          class="flex items-center gap-3 px-6 py-3 bg-red-800/80 backdrop-blur-sm hover:bg-red-700/80 rounded-xl transition-all duration-300 border border-red-700/50 hover:border-red-600/50 shadow-lg hover:shadow-xl hover:scale-105"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16,17 21,12 16,7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          <span class="font-medium">Logout</span>
        </button>
      {/if}
    </div>

    <!-- PIN Code Display During Authentication -->
    {#if authState.isAuthenticating && authState.currentPin}
      <div class="max-w-lg mx-auto mb-8 p-8 bg-gradient-to-br from-blue-900/80 to-purple-900/80 backdrop-blur-sm border border-blue-500/50 rounded-xl shadow-2xl animate-pulse">
        <div class="text-center">
          <div class="mb-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mx-auto text-blue-400">
              <rect x="3" y="5" width="18" height="14" rx="2"></rect>
              <line x1="3" y1="10" x2="21" y2="10"></line>
              <line x1="7" y1="15" x2="7.01" y2="15"></line>
              <line x1="11" y1="15" x2="13" y2="15"></line>
            </svg>
          </div>
          <h3 class="text-2xl font-bold text-blue-200 mb-3">🔑 Authentication In Progress</h3>
          <p class="text-blue-300 mb-6">Enter this PIN code in the Plex popup window:</p>
          <div class="bg-white/10 backdrop-blur-sm rounded-xl p-6 mb-6 border border-blue-400/30">
            <div class="text-4xl font-mono font-bold text-white tracking-widest select-all">
              {authState.currentPin}
            </div>
            <p class="text-blue-200 text-sm mt-2">👆 Click to select and copy</p>
          </div>
          <div class="flex items-center justify-center gap-2 text-blue-300 text-sm">
            <div class="animate-spin rounded-full h-4 w-4 border-2 border-blue-400 border-t-transparent"></div>
            <span>Waiting for authentication...</span>
          </div>
        </div>
      </div>
    {/if}

    <!-- Authentication Error Display -->
    {#if authState.authError}
      <div class="max-w-lg mx-auto mb-8 p-6 bg-red-900/80 backdrop-blur-sm border border-red-700/50 rounded-xl shadow-lg">
        <div class="flex items-center gap-3 mb-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-red-400">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
          <h3 class="text-lg font-semibold text-red-200">Authentication Error</h3>
        </div>
        <p class="text-red-200 mb-4">{authState.authError}</p>
        <button
          on:click={() => authState.authError = ''}
          class="px-4 py-2 bg-red-700/50 hover:bg-red-600/50 text-red-200 rounded-lg transition-colors text-sm"
        >
          Dismiss
        </button>
      </div>
    {/if}

    <!-- Configuration Panel -->
    {#if showConfig && authState.isAuthenticated}
      <div class="max-w-lg mx-auto mb-10 p-8 bg-gray-800/90 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-2xl">
        <h2 class="text-2xl font-bold mb-6 text-center bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Optional Configuration
        </h2>
        
        <!-- Authentication Status -->
        <div class="mb-6 p-4 bg-green-900/30 border border-green-600/30 rounded-lg">
          <div class="flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-green-400">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22,4 12,14.01 9,11.01"></polyline>
            </svg>
            <div>
              <p class="text-green-200 font-medium">✅ Connected to Plex</p>
              <p class="text-green-300 text-sm">Authentication successful</p>
            </div>
          </div>
        </div>
        
        <div class="space-y-6">
          <div>
            <label for="baseUrl" class="block text-sm font-semibold mb-2 text-gray-200">
              Plex Server URL (Optional - for Genre Filtering)
            </label>
            <input
              id="baseUrl"
              type="text"
              bind:value={config.baseUrl}
              placeholder="http://your-plex-server:32400"
              class="w-full px-4 py-3 bg-gray-700/80 border border-gray-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 backdrop-blur-sm"
            />
            <p class="text-xs text-gray-400 mt-2">
              🎯 <strong>Optional:</strong> Add your local Plex server URL to enable genre filtering and improved poster loading.
              The app works fine without this for basic movie randomization.
            </p>
          </div>
          
          <button
            on:click={saveConfig}
            class="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-xl transition-all duration-300 font-semibold text-white shadow-lg hover:shadow-xl hover:scale-105"
          >
            Save Settings
          </button>
        </div>
      </div>
    {/if}

    <!-- Filters Panel -->
    {#if showFilters}
      <div class="max-w-2xl mx-auto mb-10 p-8 bg-purple-800/90 backdrop-blur-sm rounded-2xl border border-purple-700/50 shadow-2xl">
        <h2 class="text-2xl font-bold mb-6 text-center bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Movie Filters
        </h2>
        
        <div class="space-y-6">
          <!-- Duration Filter -->
          <div>
            <label class="block text-sm font-semibold mb-3 text-purple-200">
              Maximum Duration
            </label>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                on:click={() => { filters.maxDuration = 0; applyFilters(); }}
                class="px-4 py-2 rounded-lg border transition-all duration-200 {filters.maxDuration === 0 ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600/50'}"
              >
                Any Length
              </button>
              <button
                on:click={() => { filters.maxDuration = 90; applyFilters(); }}
                class="px-4 py-2 rounded-lg border transition-all duration-200 {filters.maxDuration === 90 ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600/50'}"
                              >
                  &lt; 90 min
                </button>
                <button
                  on:click={() => { filters.maxDuration = 120; applyFilters(); }}
                  class="px-4 py-2 rounded-lg border transition-all duration-200 {filters.maxDuration === 120 ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600/50'}"
                >
                  &lt; 2 hours
                </button>
                <button
                  on:click={() => { filters.maxDuration = 150; applyFilters(); }}
                  class="px-4 py-2 rounded-lg border transition-all duration-200 {filters.maxDuration === 150 ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600/50'}"
                >
                  &lt; 2.5 hours
              </button>
            </div>
          </div>

          <!-- Rating Filter -->
          <div>
            <label class="block text-sm font-semibold mb-3 text-purple-200">
              Minimum Rating
            </label>
            <div class="grid grid-cols-3 md:grid-cols-6 gap-3">
              <button
                on:click={() => { filters.minRating = 0; applyFilters(); }}
                class="px-4 py-2 rounded-lg border transition-all duration-200 {filters.minRating === 0 ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600/50'}"
              >
                Any
              </button>
              <button
                on:click={() => { filters.minRating = 6; applyFilters(); }}
                class="px-4 py-2 rounded-lg border transition-all duration-200 {filters.minRating === 6 ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600/50'}"
              >
                6.0+
              </button>
              <button
                on:click={() => { filters.minRating = 7; applyFilters(); }}
                class="px-4 py-2 rounded-lg border transition-all duration-200 {filters.minRating === 7 ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600/50'}"
              >
                7.0+
              </button>
              <button
                on:click={() => { filters.minRating = 8; applyFilters(); }}
                class="px-4 py-2 rounded-lg border transition-all duration-200 {filters.minRating === 8 ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600/50'}"
              >
                8.0+
              </button>
              <button
                on:click={() => { filters.minRating = 8.5; applyFilters(); }}
                class="px-4 py-2 rounded-lg border transition-all duration-200 {filters.minRating === 8.5 ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600/50'}"
              >
                8.5+
              </button>
              <button
                on:click={() => { filters.minRating = 9; applyFilters(); }}
                class="px-4 py-2 rounded-lg border transition-all duration-200 {filters.minRating === 9 ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600/50'}"
              >
                9.0+
              </button>
            </div>
                     </div>

           <!-- Genre Exclusions -->
           <div>
             <label class="block text-sm font-semibold mb-3 text-purple-200">
               Exclude Genres
             </label>
             {#if loadingGenres}
               <div class="bg-purple-900/30 rounded-lg p-4 border border-purple-600/30">
                 <div class="text-center">
                   <div class="inline-block animate-spin rounded-full h-6 w-6 border-2 border-purple-400 border-t-transparent mb-3"></div>
                   <p class="text-purple-200 text-sm font-medium mb-2">Loading movie genres...</p>
                   <p class="text-purple-300 text-xs mb-3">Fetching detailed metadata from your Plex server</p>
                   <div class="w-full bg-purple-800/50 rounded-full h-2 mb-2">
                     <div 
                       class="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300" 
                       style="width: {genreLoadProgress}%"
                     ></div>
                   </div>
                   <p class="text-purple-300 text-xs">{genreLoadProgress}% complete</p>
                 </div>
               </div>
             {:else if availableGenres.length > 0}
               <div class="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                 {#each availableGenres as genre}
                   <label class="flex items-center gap-2 cursor-pointer">
                     <input
                       type="checkbox"
                       bind:group={filters.excludedGenres}
                       value={genre}
                       on:change={() => applyFilters()}
                       class="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500 focus:ring-2"
                     />
                     <span class="text-sm text-gray-300 truncate">{genre}</span>
                   </label>
                 {/each}
               </div>
               {#if filters.excludedGenres.length > 0}
                 <p class="text-xs text-purple-300 mt-2">
                   Excluding {filters.excludedGenres.length} genre{filters.excludedGenres.length !== 1 ? 's' : ''}
                 </p>
               {/if}
             {:else if movies.length === 0}
               <p class="text-gray-400 text-sm">
                 Load your watchlist first to enable genre filtering
               </p>
             {:else if !config.baseUrl}
               <div class="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3">
                 <p class="text-yellow-200 text-sm">
                   ⚠️ Plex server URL required for genre information.
                 </p>
               </div>
             {:else}
               <div class="text-center py-4">
                 <p class="text-gray-400 text-sm mb-3">
                   Genre information not loaded yet
                 </p>
                 <button
                   on:click={fetchGenresForMovies}
                   disabled={loadingGenres}
                   class="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
                 >
                   Load Genres
                 </button>
               </div>
             {/if}
           </div>

          <!-- Filter Results -->
          <div class="bg-purple-900/50 rounded-lg p-4 text-center">
            <p class="text-purple-200">
              {#if filteredMovies.length > 0}
                Showing <span class="font-bold text-purple-100">{filteredMovies.length}</span> of <span class="font-bold text-purple-100">{movies.length}</span> movies
              {:else if movies.length > 0}
                <span class="text-yellow-300">⚠️ No movies match your filters</span>
              {:else}
                Load your watchlist first
              {/if}
            </p>
          </div>

          <!-- Clear Filters -->
          <button
            on:click={() => { 
              filters = { maxDuration: 0, minRating: 0, excludedGenres: [] };
              applyFilters();
            }}
            class="w-full px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 rounded-xl transition-all duration-300 font-semibold text-white shadow-lg hover:shadow-xl"
          >
            Clear All Filters
          </button>
        </div>
      </div>
    {/if}

    <!-- Main Controls -->
    <div class="text-center mb-12">
      {#if !authState.isAuthenticated && !authState.isAuthenticating}
        <!-- Pre-authentication message -->
        <div class="max-w-2xl mx-auto p-8 bg-gradient-to-br from-blue-900/50 to-purple-900/50 backdrop-blur-sm rounded-2xl border border-blue-700/30 shadow-2xl">
          <div class="mb-6">
            <div class="mx-auto w-16 h-16 bg-gradient-to-br from-orange-500 to-yellow-500 rounded-full flex items-center justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <h3 class="text-2xl font-bold text-white mb-3">Ready to Find Your Next Movie?</h3>
            <p class="text-blue-200 leading-relaxed">
              Connect to your Plex account to access your watchlist and discover your next perfect movie night. 
              No manual setup required - just one click to get started!
            </p>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
            <div class="flex items-start gap-3">
              <div class="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span class="text-blue-300 text-sm font-bold">1</span>
              </div>
              <div>
                <h4 class="text-white font-semibold mb-1">Connect</h4>
                <p class="text-blue-200 text-sm">Securely login with your Plex account</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <div class="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span class="text-purple-300 text-sm font-bold">2</span>
              </div>
              <div>
                <h4 class="text-white font-semibold mb-1">Load</h4>
                <p class="text-purple-200 text-sm">Import your watchlist automatically</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <div class="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span class="text-green-300 text-sm font-bold">3</span>
              </div>
              <div>
                <h4 class="text-white font-semibold mb-1">Discover</h4>
                <p class="text-green-200 text-sm">Find your perfect movie instantly</p>
              </div>
            </div>
          </div>
        </div>
      {:else if authState.isAuthenticated}
        <!-- Authenticated controls -->
        <div class="space-y-6">
          {#if movies.length === 0}
            <button
              on:click={fetchWatchlist}
              disabled={loading || loadingImages}
              class="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 text-lg"
            >
              {#if loading}
                Loading from plex.tv...
              {:else if loadingImages}
                Loading Images...
              {:else}
                Load Watchlist
              {/if}
            </button>
          {/if}
          
          {#if movies.length > 0}
            <div class="flex flex-col sm:flex-row gap-6 justify-center items-center">
              <button
                on:click={selectRandomMovie}
                disabled={!imagesLoaded || isSpinning || showWinnerPause || (filteredMovies.length === 0 && movies.length > 0)}
                class="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 text-lg"
              >
                <Shuffle size={24} class="{isSpinning ? 'animate-spin' : ''}" />
                {#if !imagesLoaded}
                  Loading Images...
                {:else if isSpinning}
                  Spinning...
                {:else if showWinnerPause}
                  Revealing Winner...
                {:else if filteredMovies.length === 0 && movies.length > 0}
                  No Movies Match Filters
                {:else}
                  Pick Random Movie
                {/if}
              </button>
              
              <div class="px-6 py-3 bg-gray-800/60 backdrop-blur-sm rounded-xl border border-gray-700/50">
                <p class="text-gray-200 font-medium">
                  🎬 {#if filteredMovies.length > 0 && filteredMovies.length < movies.length}
                    {filteredMovies.length} filtered movie{filteredMovies.length !== 1 ? 's' : ''} ({movies.length} total)
                  {:else}
                    {movies.length} movie{movies.length !== 1 ? 's' : ''} in watchlist
                  {/if}
                </p>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Slot Machine Animation -->
    {#if (isSpinning || showWinnerPause) && spinningMovies.length > 0}
      <div class="max-w-6xl mx-auto mb-12">
        <div class="relative bg-gradient-to-r from-yellow-600/20 via-yellow-400/30 to-yellow-600/20 rounded-2xl p-8 border-4 border-yellow-400/50 shadow-2xl slot-machine-container">
          <!-- Slot Machine Header -->
          <div class="text-center mb-6">
            {#if showWinnerPause}
              <h3 class="text-3xl font-bold text-green-300 mb-2 animate-pulse">🎉 Winner Selected! 🎉</h3>
              <p class="text-green-200">Your perfect movie has been chosen!</p>
            {:else}
              <h3 class="text-2xl font-bold text-yellow-300 mb-2">🎰 Spinning the Movie Wheel!</h3>
              <p class="text-yellow-200">Finding your perfect movie...</p>
            {/if}
          </div>
          
          <!-- Slot Machine Container -->
          <div class="relative overflow-hidden rounded-xl bg-black/40 backdrop-blur-sm border-2 border-yellow-400/30" style="height: 280px;">
            <!-- Center selection indicator -->
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div class="w-48 h-72 border-4 {showWinnerPause ? 'border-green-400 bg-green-400/20' : 'border-yellow-400 bg-yellow-400/10'} rounded-xl shadow-2xl {showWinnerPause ? 'winner-indicator' : 'slot-indicator'}">
                <div class="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div class="w-8 h-8 {showWinnerPause ? 'bg-green-400 border-green-300' : 'bg-yellow-400 border-yellow-300'} rotate-45 border-2"></div>
                </div>
                <div class="absolute -bottom-4 left-1/2 transform -translate-x-1/2">
                  <div class="w-8 h-8 {showWinnerPause ? 'bg-green-400 border-green-300' : 'bg-yellow-400 border-yellow-300'} rotate-45 border-2"></div>
                </div>
                {#if showWinnerPause}
                  <!-- Winner celebration effects -->
                  <div class="absolute -top-2 -left-2 w-4 h-4 bg-green-300 rounded-full animate-ping"></div>
                  <div class="absolute -top-1 -right-3 w-3 h-3 bg-yellow-300 rounded-full animate-ping delay-300"></div>
                  <div class="absolute -bottom-2 -left-3 w-3 h-3 bg-green-300 rounded-full animate-ping delay-700"></div>
                  <div class="absolute -bottom-1 -right-2 w-4 h-4 bg-yellow-300 rounded-full animate-ping delay-500"></div>
                {/if}
              </div>
            </div>
            
            <!-- Moving movie strip -->
            <div 
              bind:this={slotMachineContainer}
              class="flex items-center h-full slot-strip"
            >
              {#each spinningMovies as movie, index}
                <div class="flex-shrink-0 w-44 h-64 relative" style="margin: 0 16px;">
                  {#if movie.poster}
                    <img 
                      src={movie.poster}
                      alt={movie.title}
                      class="w-full h-full object-cover rounded-lg shadow-lg border-2 border-gray-600"
                      loading="eager"
                    />
                  {:else}
                    <div class="w-full h-full bg-gray-700 rounded-lg shadow-lg border-2 border-gray-600 flex items-center justify-center">
                      <Film size={48} class="text-gray-400" />
                    </div>
                  {/if}
                  <div class="absolute bottom-0 left-0 right-0 bg-black/80 text-white p-2 rounded-b-lg">
                    <p class="text-xs font-medium truncate">{movie.title}</p>
                    {#if movie.year}
                      <p class="text-xs text-gray-300">{movie.year}</p>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
            
            <!-- Fade edges for better visual effect -->
            <div class="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-black to-transparent pointer-events-none z-5"></div>
            <div class="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-black to-transparent pointer-events-none z-5"></div>
          </div>
          
          <!-- Spinning Indicator -->
          <div class="text-center mt-6">
            {#if showWinnerPause}
              <div class="inline-flex items-center gap-3 px-6 py-3 bg-green-600/20 rounded-full border border-green-400/30">
                <div class="w-4 h-4 bg-green-400 rounded-full animate-bounce"></div>
                <span class="text-green-200 font-medium">🎊 Revealing your movie... 🎊</span>
              </div>
            {:else}
              <div class="inline-flex items-center gap-3 px-6 py-3 bg-yellow-600/20 rounded-full border border-yellow-400/30">
                <div class="w-4 h-4 bg-yellow-400 rounded-full animate-pulse"></div>
                <span class="text-yellow-200 font-medium">Spinning...</span>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <!-- Error Message -->
    {#if error}
      <div class="max-w-lg mx-auto mb-10 p-6 bg-red-900/80 backdrop-blur-sm border border-red-700/50 rounded-xl shadow-lg">
        <p class="text-red-200 text-center font-medium">⚠️ {error}</p>
      </div>
    {/if}

    <!-- Loading State -->
    {#if loading || loadingImages}
      <div class="text-center mb-12">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-purple-600/20 rounded-full mb-4">
          <div class="animate-spin rounded-full h-10 w-10 border-4 border-purple-400 border-t-transparent"></div>
        </div>
        {#if loading}
          <p class="text-gray-300 text-lg font-medium">Loading your watchlist...</p>
          <p class="text-gray-400 text-sm mt-2">Fetching movies from plex.tv</p>
        {:else if loadingImages}
          <p class="text-gray-300 text-lg font-medium">Preloading movie posters...</p>
          <p class="text-gray-400 text-sm mt-2">Preparing for smooth slot machine animation</p>
          <div class="w-64 mx-auto mt-4 bg-gray-700 rounded-full h-2">
            <div 
              class="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-300" 
              style="width: {imageLoadProgress}%"
            ></div>
          </div>
          <p class="text-gray-400 text-xs mt-2">{imageLoadProgress}% complete</p>
        {/if}
      </div>
    {/if}



    <!-- Selected Movie Display -->
    {#if selectedMovie}
      <div class="max-w-4xl mx-auto bg-gray-800/90 backdrop-blur-sm rounded-2xl border border-gray-700/50 overflow-hidden shadow-2xl animate-bounce-in relative">
        <!-- Celebration Confetti Effect -->
        <div class="absolute -top-4 -left-4 w-8 h-8 bg-yellow-400 rounded-full animate-ping"></div>
        <div class="absolute -top-2 -right-6 w-6 h-6 bg-green-400 rounded-full animate-ping delay-300"></div>
        <div class="absolute -bottom-4 -left-2 w-4 h-4 bg-purple-400 rounded-full animate-ping delay-700"></div>
        <div class="absolute -bottom-6 -right-4 w-8 h-8 bg-pink-400 rounded-full animate-ping delay-500"></div>
        <div class="md:flex">
          <!-- Movie Poster -->
          {#if selectedMovie.poster}
            <div class="md:w-2/5 relative group">
              <img 
                src={selectedMovie.poster}
                alt={selectedMovie.title}
                class="w-full h-80 md:h-full object-cover transition-transform duration-300 group-hover:scale-105"
                on:error={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
          {/if}
          
          <!-- Movie Details -->
          <div class="p-8 {selectedMovie.poster ? 'md:w-3/5' : 'w-full'}">
            <div class="flex items-start justify-between mb-6">
              <h2 class="text-3xl md:text-4xl font-bold text-white leading-tight">{selectedMovie.title}</h2>
              <button
                on:click={clearSelection}
                class="text-gray-400 hover:text-white text-2xl p-2 hover:bg-gray-700/50 rounded-full transition-all duration-200"
                aria-label="Clear selection"
              >
                ×
              </button>
            </div>
            
            <div class="flex flex-wrap items-center gap-6 mb-6">
              {#if selectedMovie.year}
                <div class="flex items-center gap-2 px-3 py-1 bg-blue-600/20 rounded-full">
                  <Calendar size={18} class="text-blue-400" />
                  <span class="text-blue-200 font-medium">{selectedMovie.year}</span>
                </div>
              {/if}
              
              {#if selectedMovie.rating && selectedMovie.rating > 0}
                <div class="flex items-center gap-2 px-3 py-1 bg-yellow-600/20 rounded-full">
                  <Star size={18} class="text-yellow-400" />
                  <span class="text-yellow-200 font-medium">{formatRating(selectedMovie.rating)}/5</span>
                </div>
              {/if}
              
              {#if selectedMovie.duration && selectedMovie.duration > 0}
                <div class="flex items-center gap-2 px-3 py-1 bg-green-600/20 rounded-full">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-400">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12,6 12,12 16,14"></polyline>
                  </svg>
                  <span class="text-green-200 font-medium">{Math.round(selectedMovie.duration)}min</span>
                </div>
              {/if}
            </div>
            
            <!-- Genre Information -->
            {#if selectedMovie.genres && selectedMovie.genres.length > 0}
              <div class="flex flex-wrap gap-2 mb-6">
                {#each selectedMovie.genres as genre}
                  <span class="px-3 py-1 bg-purple-600/20 text-purple-200 rounded-full text-sm font-medium border border-purple-500/30">
                    {genre}
                  </span>
                {/each}
              </div>
            {/if}
            
            {#if selectedMovie.summary}
              <p class="text-gray-300 mb-8 leading-relaxed text-lg">
                {selectedMovie.summary}
              </p>
            {/if}
            
            <div class="flex flex-wrap gap-4">
              <button
                on:click={selectRandomMovie}
                class="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-xl transition-all duration-300 font-semibold shadow-lg hover:shadow-xl hover:scale-105"
              >
                <Shuffle size={20} />
                Pick Another
              </button>
              
              {#if selectedMovie.guid && selectedMovie.guid.includes('imdb')}
                <a
                  href="https://www.imdb.com/title/{selectedMovie.guid.split('imdb://')[1].split('?')[0]}/"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 rounded-xl transition-all duration-300 font-semibold shadow-lg hover:shadow-xl hover:scale-105"
                >
                  <ExternalLink size={20} />
                  View on IMDb
                </a>
              {/if}
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Footer -->
    <footer class="text-center mt-16 text-gray-400">
      <p class="text-lg">
        {#if authState.isAuthenticated}
          Enjoying your movie discoveries? Share this app with fellow Plex users!
        {:else}
          Seamlessly connect to your Plex account and discover your next favorite movie
        {/if}
      </p>
      <p class="text-sm mt-2 opacity-75">Made with ❤️ for movie lovers • Powered by Plex</p>
    </footer>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  /* Custom animations */
  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes slide-in-left {
    from {
      opacity: 0;
      transform: translateX(-30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes bounce-in {
    0% {
      opacity: 0;
      transform: scale(0.3);
    }
    50% {
      transform: scale(1.05);
    }
    70% {
      transform: scale(0.9);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-in {
    animation: fade-in 0.6s ease-out;
  }

  .animate-slide-in {
    animation: slide-in-left 0.8s ease-out;
  }

  .animate-bounce-in {
    animation: bounce-in 0.8s ease-out;
  }

  /* Glass morphism effect */
  .glass {
    backdrop-filter: blur(16px) saturate(180%);
    background-color: rgba(17, 25, 40, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.125);
  }

  /* Gradient text animation */
  @keyframes gradient-shift {
    0%, 100% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
  }

  .animate-gradient {
    background-size: 200% 200%;
    animation: gradient-shift 4s ease infinite;
  }

  /* Slot machine animations */
  @keyframes slot-glow {
    0%, 100% {
      box-shadow: 0 0 20px rgba(251, 191, 36, 0.3);
    }
    50% {
      box-shadow: 0 0 40px rgba(251, 191, 36, 0.6);
    }
  }

  .slot-container {
    animation: slot-glow 2s ease-in-out infinite;
  }

  /* Celebration particles */
  @keyframes confetti {
    0% {
      transform: translateY(0) rotate(0deg);
      opacity: 1;
    }
    100% {
      transform: translateY(-100px) rotate(360deg);
      opacity: 0;
    }
  }

  .confetti {
    animation: confetti 1s ease-out infinite;
  }

  /* Slot machine styles */
  @keyframes slot-machine-glow {
    0%, 100% {
      box-shadow: 0 0 30px rgba(251, 191, 36, 0.4);
    }
    50% {
      box-shadow: 0 0 60px rgba(251, 191, 36, 0.8);
    }
  }

  .slot-machine-container {
    animation: slot-machine-glow 2s ease-in-out infinite;
  }

  @keyframes slot-indicator {
    0%, 100% {
      transform: scale(1);
      opacity: 0.8;
    }
    50% {
      transform: scale(1.05);
      opacity: 1;
    }
  }

  .slot-indicator {
    animation: slot-indicator 1.5s ease-in-out infinite;
  }

  @keyframes winner-celebration {
    0%, 100% {
      transform: scale(1) rotate(0deg);
      opacity: 0.9;
    }
    25% {
      transform: scale(1.08) rotate(1deg);
      opacity: 1;
    }
    50% {
      transform: scale(1.05) rotate(0deg);
      opacity: 1;
    }
    75% {
      transform: scale(1.08) rotate(-1deg);
      opacity: 1;
    }
  }

  .winner-indicator {
    animation: winner-celebration 1s ease-in-out infinite;
  }

  /* Ensure smooth hardware acceleration for slot machine */
  .slot-strip {
    transform: translateZ(0);
    will-change: transform;
    backface-visibility: hidden;
  }
</style>
