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
  }

  interface PlexConfig {
    baseUrl: string;
    token: string;
  }

  let config: PlexConfig = {
    baseUrl: '',
    token: ''
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

  // Load config from localStorage on mount
  onMount(() => {
    const savedConfig = localStorage.getItem('plexConfig');
    if (savedConfig) {
      config = JSON.parse(savedConfig);
    } else {
      showConfig = true;
    }
  });

  function saveConfig() {
    localStorage.setItem('plexConfig', JSON.stringify(config));
    showConfig = false;
    if (config.baseUrl && config.token) {
      fetchWatchlist();
    }
  }

  async function fetchWatchlist() {
    if (!config.baseUrl || !config.token) {
      error = 'Please configure your Plex server settings';
      return;
    }

    loading = true;
    error = '';
    movies = [];
    imagesLoaded = false;

    try {
      // First, get user account info to access watchlist
      const accountResponse = await fetch(`${config.baseUrl}/myplex/account?X-Plex-Token=${config.token}`);
      if (!accountResponse.ok) {
        throw new Error('Failed to authenticate with Plex server');
      }

      // Fetch all watchlist movies with pagination
      const allMovies: Movie[] = [];
      let start = 0;
      const size = 50; // Fetch in batches of 50
      let hasMore = true;
      let totalSize = 0;

      console.log('Starting watchlist fetch...');

      while (hasMore) {
        console.log(`Fetching batch starting at ${start}...`);
        
        const watchlistResponse = await fetch(
          `https://metadata.provider.plex.tv/library/sections/watchlist/all?X-Plex-Token=${config.token}&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${size}`
        );
        
        if (!watchlistResponse.ok) {
          throw new Error(`Failed to fetch watchlist: ${watchlistResponse.status}`);
        }

        const text = await watchlistResponse.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');
        
        // Get MediaContainer info first
        const mediaContainer = xmlDoc.querySelector('MediaContainer');
        if (mediaContainer && totalSize === 0) {
          totalSize = parseInt(mediaContainer.getAttribute('totalSize') || '0');
          console.log(`Total watchlist items reported by API: ${totalSize}`);
        }

        // Get all Video elements (not just movies initially)
        const allVideoElements = xmlDoc.querySelectorAll('Video');
        const movieElements = xmlDoc.querySelectorAll('Video[type="movie"]');
        
        console.log(`Found ${allVideoElements.length} total items, ${movieElements.length} movies in this batch`);

        const batchMovies: Movie[] = [];

        movieElements.forEach(video => {
          const movie: Movie = {
            title: video.getAttribute('title') || 'Unknown Title',
            year: parseInt(video.getAttribute('year') || '0') || undefined,
            summary: video.getAttribute('summary') || '',
            rating: parseFloat(video.getAttribute('rating') || '0') || undefined,
            guid: video.getAttribute('guid') || '',
            key: video.getAttribute('key') || ''
          };

                  // Try to get poster URL
        const thumb = video.getAttribute('thumb');
        if (thumb) {
          // Check if thumb is already a full URL (TMDB) or a relative path (Plex server)
          if (thumb.startsWith('http://') || thumb.startsWith('https://')) {
            // It's already a full URL (like TMDB), use it directly
            movie.poster = thumb;
          } else {
            // It's a relative path, use the Plex server
            movie.poster = `${config.baseUrl}${thumb}?X-Plex-Token=${config.token}`;
          }
        }

          batchMovies.push(movie);
        });

        allMovies.push(...batchMovies);
        console.log(`Added ${batchMovies.length} movies. Total so far: ${allMovies.length}`);

        // Determine if we should continue
        // Continue if we haven't reached the total size yet or if we got items in this batch
        const hasItemsInBatch = allVideoElements.length > 0;
        const hasMoreBasedOnTotal = totalSize > 0 && (start + allVideoElements.length) < totalSize;
        const underSafetyLimit = start < 1000;

        console.log(`Pagination check: hasItemsInBatch=${hasItemsInBatch}, hasMoreBasedOnTotal=${hasMoreBasedOnTotal}, start+items=${start + allVideoElements.length}, totalSize=${totalSize}`);

        if (hasItemsInBatch && hasMoreBasedOnTotal && underSafetyLimit) {
          start += allVideoElements.length; // Use actual items received, not requested size
          console.log(`Continuing to next batch at ${start}...`);
        } else {
          hasMore = false;
          console.log(`Stopping pagination. Reason: hasItems=${hasItemsInBatch}, hasMore=${hasMoreBasedOnTotal}, underLimit=${underSafetyLimit}`);
        }
      }

      movies = allMovies;
      console.log(`Loaded ${movies.length} movies from watchlist`);
      
      if (movies.length === 0) {
        error = 'No movies found in your watchlist';
      } else {
        // Preload all movie poster images
        await preloadImages(movies);
      }

    } catch (e) {
      console.error('Error fetching watchlist:', e);
      error = e instanceof Error ? e.message : 'Failed to fetch watchlist';
    } finally {
      loading = false;
    }
  }

  function selectRandomMovie() {
    if (movies.length === 0 || !imagesLoaded || isSpinning) return;
    
    // Clear previous selection
    selectedMovie = null;
    isSpinning = true;
    
    // Select random movie and index
    const randomIndex = Math.floor(Math.random() * movies.length);
    selectedMovieIndex = randomIndex;
    
    // Create spinning array with multiple copies to simulate infinite scroll
    // We need enough copies to make it look continuous and allow for spinning
    const copies = 5;
    spinningMovies = [];
    for (let i = 0; i < copies; i++) {
      spinningMovies.push(...movies);
    }
    
    // Start the slot machine animation after a brief delay
    setTimeout(() => {
      startSlotMachineAnimation();
    }, 100);
  }

  function startSlotMachineAnimation() {
    if (!slotMachineContainer) return;
    
    const itemWidth = 208; // Width of each movie poster (w-44 = 176px) + margin (16px each side = 32px) = 208px total
    const containerWidth = slotMachineContainer.parentElement?.clientWidth || 1200;
    const visibleItems = Math.floor(containerWidth / itemWidth);
    const centerPosition = Math.floor(visibleItems / 2);
    
    // Start from beginning
    slotMachineContainer.style.transform = `translateX(0px)`;
    slotMachineContainer.style.transition = 'none';
    
    // Calculate final position - we want the selected movie from the middle copy to be centered
    const middleCopyStartIndex = 2 * movies.length; // Third copy (0-indexed)
    const selectedMoviePositionInMiddleCopy = middleCopyStartIndex + selectedMovieIndex;
    const finalPosition = (selectedMoviePositionInMiddleCopy * itemWidth) - (centerPosition * itemWidth);
    
    // Add extra spins for dramatic effect
    const extraSpins = movies.length * itemWidth * 2; // Two extra full rotations
    const totalDistance = finalPosition + extraSpins;
    
    // Start animation after a brief delay
    requestAnimationFrame(() => {
      // Apply the spinning animation with custom easing for slot machine effect
      slotMachineContainer.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.25, 1)';
      slotMachineContainer.style.transform = `translateX(-${totalDistance}px)`;
      
      // Set the selected movie after animation completes
      setTimeout(() => {
        selectedMovie = movies[selectedMovieIndex];
        isSpinning = false;
      }, 4000);
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

    <!-- Config Button -->
    <div class="flex justify-center mb-8">
      <button
        on:click={() => showConfig = !showConfig}
        class="flex items-center gap-3 px-6 py-3 bg-gray-800/80 backdrop-blur-sm hover:bg-gray-700/80 rounded-xl transition-all duration-300 border border-gray-700/50 hover:border-gray-600/50 shadow-lg hover:shadow-xl hover:scale-105"
      >
        <Settings size={20} />
        <span class="font-medium">Settings</span>
      </button>
    </div>

    <!-- Configuration Panel -->
    {#if showConfig}
      <div class="max-w-lg mx-auto mb-10 p-8 bg-gray-800/90 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-2xl">
        <h2 class="text-2xl font-bold mb-6 text-center bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Plex Configuration
        </h2>
        
        <div class="space-y-6">
          <div>
            <label for="baseUrl" class="block text-sm font-semibold mb-2 text-gray-200">
              Plex Server URL
            </label>
            <input
              id="baseUrl"
              type="text"
              bind:value={config.baseUrl}
              placeholder="http://your-plex-server:32400"
              class="w-full px-4 py-3 bg-gray-700/80 border border-gray-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 backdrop-blur-sm"
            />
          </div>
          
          <div>
            <label for="token" class="block text-sm font-semibold mb-2 text-gray-200">
              Plex Token
            </label>
            <input
              id="token"
              type="password"
              bind:value={config.token}
              placeholder="Your Plex authentication token"
              class="w-full px-4 py-3 bg-gray-700/80 border border-gray-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 backdrop-blur-sm"
            />
            <p class="text-xs text-gray-400 mt-2">
              Find your token in Plex settings or 
              <a href="https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/" 
                 target="_blank" 
                 class="text-purple-400 hover:text-purple-300 underline transition-colors">
                follow this guide
              </a>
            </p>
          </div>
          
          <button
            on:click={saveConfig}
            class="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-xl transition-all duration-300 font-semibold text-white shadow-lg hover:shadow-xl hover:scale-105"
          >
            Save Configuration
          </button>
        </div>
      </div>
    {/if}

    <!-- Main Controls -->
    <div class="text-center mb-12">
      <div class="space-y-6">
        <button
          on:click={fetchWatchlist}
          disabled={loading || loadingImages || !config.baseUrl || !config.token}
          class="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 text-lg"
        >
          {#if loading}
            Loading Watchlist...
          {:else if loadingImages}
            Loading Images...
          {:else}
            Load Watchlist
          {/if}
        </button>
        
        {#if movies.length > 0}
          <div class="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <button
              on:click={selectRandomMovie}
              disabled={!imagesLoaded || isSpinning}
              class="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 text-lg"
            >
              <Shuffle size={24} class="{isSpinning ? 'animate-spin' : ''}" />
              {#if !imagesLoaded}
                Loading Images...
              {:else if isSpinning}
                Spinning...
              {:else}
                Pick Random Movie
              {/if}
            </button>
            
            <div class="px-6 py-3 bg-gray-800/60 backdrop-blur-sm rounded-xl border border-gray-700/50">
              <p class="text-gray-200 font-medium">
                🎬 {movies.length} movie{movies.length !== 1 ? 's' : ''} in watchlist
              </p>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Slot Machine Animation -->
    {#if isSpinning && spinningMovies.length > 0}
      <div class="max-w-6xl mx-auto mb-12">
        <div class="relative bg-gradient-to-r from-yellow-600/20 via-yellow-400/30 to-yellow-600/20 rounded-2xl p-8 border-4 border-yellow-400/50 shadow-2xl slot-machine-container">
          <!-- Slot Machine Header -->
          <div class="text-center mb-6">
            <h3 class="text-2xl font-bold text-yellow-300 mb-2">🎰 Spinning the Movie Wheel!</h3>
            <p class="text-yellow-200">Finding your perfect movie...</p>
          </div>
          
          <!-- Slot Machine Container -->
          <div class="relative overflow-hidden rounded-xl bg-black/40 backdrop-blur-sm border-2 border-yellow-400/30" style="height: 280px;">
            <!-- Center selection indicator -->
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div class="w-48 h-72 border-4 border-yellow-400 rounded-xl bg-yellow-400/10 shadow-2xl slot-indicator">
                <div class="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div class="w-8 h-8 bg-yellow-400 rotate-45 border-2 border-yellow-300"></div>
                </div>
                <div class="absolute -bottom-4 left-1/2 transform -translate-x-1/2">
                  <div class="w-8 h-8 bg-yellow-400 rotate-45 border-2 border-yellow-300"></div>
                </div>
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
            <div class="inline-flex items-center gap-3 px-6 py-3 bg-yellow-600/20 rounded-full border border-yellow-400/30">
              <div class="w-4 h-4 bg-yellow-400 rounded-full animate-pulse"></div>
              <span class="text-yellow-200 font-medium">Spinning...</span>
            </div>
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
          <p class="text-gray-400 text-sm mt-2">Fetching movies from Plex API</p>
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
            </div>
            
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
      <p class="text-lg">Connect to your Plex server to randomly select movies from your watchlist</p>
      <p class="text-sm mt-2 opacity-75">Made with ❤️ for movie lovers</p>
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

  /* Ensure smooth hardware acceleration for slot machine */
  .slot-strip {
    transform: translateZ(0);
    will-change: transform;
    backface-visibility: hidden;
  }
</style>
