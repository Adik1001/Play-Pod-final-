// Toggle favorites view

const DB_NAME = 'audioPlayerDB';
const DB_VERSION = 1;
let db;
async function toggleFavoritesView() {
  const showFavoritesBtn = document.getElementById('showFavoritesBtn');
  const isFavoritesMode = showFavoritesBtn.classList.toggle('active');

  if (isFavoritesMode) {
    // Show only favorites
    showFavoritesBtn.textContent = 'Show All';
    await loadFavorites();
  } else {
    // Show all songs
    showFavoritesBtn.textContent = 'Show Favorites';
    await loadFiles();
  }
}


async function toggleFavorite(audioFilename) {
  try {
    const transaction = db.transaction(['favorites'], 'readwrite');
    const store = transaction.objectStore('favorites');

    // Check if already in favorites
    const getRequest = store.get(audioFilename);

    getRequest.onsuccess = async (event) => {
      const isFavorite = !!event.target.result;
      
      if (isFavorite) {
        // Remove from favorites
        store.delete(audioFilename);
      } else {
        // Add to favorites
        store.add({ audio: audioFilename });
      }

      // Update UI immediately without waiting for transaction to complete
      const favoriteBtn = document.querySelector(`.song-item button.favorite-btn[data-audio="${audioFilename}"]`);
      if (favoriteBtn) {
        favoriteBtn.innerHTML = isFavorite ? '☆' : '★';
        favoriteBtn.classList.toggle('active', !isFavorite);
      }

      transaction.oncomplete = async () => {
        // Reload favorites or all files based on the current view
        const showFavoritesBtn = document.getElementById('showFavoritesBtn');
        if (showFavoritesBtn && showFavoritesBtn.classList.contains('active')) {
          await loadFavorites();
        } else {
          await loadFiles();
        }
      };
    };
  } catch (error) {
    console.error('Error toggling favorite:', error);
  }
}

// Load favorites from IndexedDB
async function loadFavorites() {
  const container = document.getElementById('fileList');
  if (!container) return;

  // Clear existing list
  container.innerHTML = '';

  try {
    // Get favorites from IndexedDB
    const favorites = await getAllEntries('favorites');
    
    if (favorites.length === 0) {
      container.innerHTML = '<p>No favorite songs yet.</p>';
      return;
    }

    // Get all metadata entries
    const allEntries = await getAllEntries('metadata');
    
    // Filter songs that are in favorites
    const favoriteSongs = allEntries.filter(entry => 
      favorites.some(fav => fav.audio === entry.audio)
    );

    if (favoriteSongs.length === 0) {
      container.innerHTML = '<p>No favorite songs found.</p>';
      return;
    }

    // Prepare data for rendering
    window.songs = favoriteSongs;
    
    // Render songs
    renderSongs(favoriteSongs);
  } catch (error) {
    console.error('Error loading favorites:', error);
    container.innerHTML = '<p>Error loading favorites. Please try again.</p>';
  }
}

// Load and display files from IndexedDB
async function loadFiles() {
  const container = document.getElementById('fileList');
  if (!container) return;

  // Clear existing list
  container.innerHTML = '';

  try {
    // Get entries from IndexedDB
    const entries = await getAllEntries('metadata');

    // Avoid duplicate rendering by using a Set
    const renderedFiles = new Set();
    const uniqueEntries = entries.filter(entry => {
      if (renderedFiles.has(entry.audio)) {
        return false; // Skip duplicates
      }
      renderedFiles.add(entry.audio);
      return true;
    });

    if (uniqueEntries.length === 0) {
      container.innerHTML = '<p>No audio files uploaded yet.</p>';
      return;
    }

    // Prepare data for rendering
    window.allSongsData = uniqueEntries;
    window.songs = uniqueEntries;

    // Render songs
    renderSongs(uniqueEntries);
  } catch (error) {
    console.error('Error loading files:', error);
    container.innerHTML = '<p>Error loading files. Please refresh the page.</p>';
  }
}
document.addEventListener('DOMContentLoaded', () => {
  initDatabase().then(() => {
    loadFiles();
    loadGenres();
    
    // Fix for the albumsViewBtn click event
    const songsViewBtn = document.getElementById('songsViewBtn');
    const albumsViewBtn = document.getElementById('albumsViewBtn');
    
    if (favoritesToggle) {
      favoritesToggle.id = 'showFavoritesBtn';
      favoritesToggle.addEventListener('click', toggleFavoritesView);
    }

    if (songsViewBtn && albumsViewBtn) {
      songsViewBtn.addEventListener('click', () => {
        document.getElementById('songsView').style.display = 'block';
        document.getElementById('albumsView').style.display = 'none';
        document.getElementById('albumDetailView').style.display = 'none';
        songsViewBtn.classList.add('active');
        albumsViewBtn.classList.remove('active');
      });
      
      // The key fix - use our new function for the album tab
      albumsViewBtn.addEventListener('click', () => {
        initializeAlbumsView();
        songsViewBtn.classList.remove('active');
        albumsViewBtn.classList.add('active');
      });
    }
    
    // Back button for album detail view
    const backToAlbumsBtn = document.getElementById('backToAlbumsBtn');
    if (backToAlbumsBtn) {
      backToAlbumsBtn.addEventListener('click', () => {
        document.getElementById('albumDetailView').style.display = 'none';
        document.getElementById('albumsView').style.display = 'block';
      });
    }
    
    // Add other event listeners...
    // (rest of your existing initialization code)
  });
});

// Database variables

// Initialize IndexedDB
function initDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = (event) => {
      console.error('Database error:', event.target.error);
      reject(event.target.error);
    };
    
    request.onsuccess = (event) => {
      db = event.target.result;
      console.log('Database opened successfully');
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create object stores
      if (!db.objectStoreNames.contains('audioFiles')) {
        const audioStore = db.createObjectStore('audioFiles', { keyPath: 'filename' });
      }
      
      if (!db.objectStoreNames.contains('coverFiles')) {
        const coverStore = db.createObjectStore('coverFiles', { keyPath: 'filename' });
      }
      
      if (!db.objectStoreNames.contains('metadata')) {
        const metadataStore = db.createObjectStore('metadata', { keyPath: 'id', autoIncrement: true });
        metadataStore.createIndex('byAudio', 'audio', { unique: true });
      }
      
      if (!db.objectStoreNames.contains('favorites')) {
        db.createObjectStore('favorites', { keyPath: 'audio' });
      }
      
      if (!db.objectStoreNames.contains('albums')) {
        const albumStore = db.createObjectStore('albums', { keyPath: 'id', autoIncrement: true });
        albumStore.createIndex('byName', 'name', { unique: false });
      }
    };
  });
}

// Handle form submission
// Handle form submission for uploading songs
document.getElementById('uploadForm').onsubmit = async (e) => {
  e.preventDefault();
  const form = e.target;

  // Get form data
  const name = form.querySelector('[name="name"]').value.trim();
  const author = form.querySelector('[name="author"]').value.trim();
  const genre = form.querySelector('[name="genre"]').value.trim();
  const audioFile = form.querySelector('[name="audio"]').files[0];
  const coverFile = form.querySelector('[name="cover"]').files[0];

  if (!name || !audioFile || !coverFile) {
    alert('All fields are required.');
    return;
  }

  try {
    // Convert files to Base64
    const audioBase64 = await fileToBase64(audioFile);
    const coverBase64 = await fileToBase64(coverFile);

    // Generate unique filenames
    const audioFilename = Date.now() + '-audio' + getExtension(audioFile.name);
    const coverFilename = Date.now() + '-cover' + getExtension(coverFile.name);

    // Store files in IndexedDB
    await storeFile('audioFiles', { filename: audioFilename, data: audioBase64 });
    await storeFile('coverFiles', { filename: coverFilename, data: coverBase64 });

    // Store metadata in IndexedDB
    await storeMetadata({
      name,
      author,
      genre,
      audio: audioFilename,
      cover: coverFilename,
      dateAdded: new Date().toISOString(),
    });

    // Reset form and reload the file list
    form.reset();
    await loadFiles();
    alert('Song uploaded successfully!');
  } catch (error) {
    console.error('Error uploading song:', error);
    alert('Failed to upload song. Please try again.');
  }
};

// Get file extension
function getExtension(filename) {
  return '.' + filename.split('.').pop();
}

// Convert file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File conversion failed'));
    reader.readAsDataURL(file);
  });
}

// Store file in IndexedDB
function storeFile(storeName, fileObj) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(fileObj);
    
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}

// Store metadata in IndexedDB
function storeMetadata(entry) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['metadata'], 'readwrite');
    const store = transaction.objectStore('metadata');
    const request = store.add(entry);
    
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}

// Get all entries from object store
function getAllEntries(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Get file from IndexedDB
function getFile(storeName, filename) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(filename);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Custom function to render songs
async function renderSongs(songsToRender) {
  const container = document.getElementById('fileList');
  const favorites = await getAllEntries('favorites');
  const favoriteIds = favorites.map(fav => fav.audio);

  container.innerHTML = ''; // Clear container first

  if (songsToRender.length === 0) {
    container.innerHTML = '<p>No songs found.</p>';
    return;
  }

  for (const song of songsToRender) {
    // Get cover file from IndexedDB
    const coverFile = await getFile('coverFiles', song.cover);
    if (!coverFile) continue;

    const wrapper = document.createElement('div');
    wrapper.className = 'song-item';
    wrapper.dataset.id = song.id;

    wrapper.innerHTML = `
      <img src="${coverFile.data}" width="100" alt="Cover">
      <div>
        <strong>${song.name}</strong>
        <span class="song-author">${song.author || ''}</span>
        ${song.genre ? `<div style="color: rgba(255, 255, 255, 0.5); font-size: 0.8em;">${song.genre}</div>` : ''}
      </div>
    `;

    wrapper.addEventListener('click', () => {
      playSong(songsToRender.indexOf(song));
    });

    const favBtn = document.createElement('button');
    favBtn.className = 'favorite-btn';
    const isFavorite = favoriteIds.includes(song.audio);
    favBtn.innerHTML = isFavorite ? '★' : '☆';
    favBtn.classList.toggle('active', isFavorite);
    favBtn.dataset.audio = song.audio; // Add data attribute to easier find button
    favBtn.onclick = (e) => {
      e.stopPropagation();
      toggleFavorite(song.audio);
    };
    wrapper.appendChild(favBtn);

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteAudio(song.id, song.audio, song.cover);
    };

    wrapper.appendChild(delBtn);
    container.appendChild(wrapper);
  }
}


// Play song
async function playSong(index) {
  const mainAudio = document.getElementById('mainAudio');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const nowPlayingCover = document.getElementById('nowPlayingCover');
  const nowPlayingSong = document.getElementById('nowPlayingSong');
  const nowPlayingAuthor = document.getElementById('nowPlayingAuthor');
  const largeArtwork = document.getElementById('largeArtwork');
  const largeSongName = document.getElementById('largeSongName');
  const largeArtistName = document.getElementById('largeArtistName');
  const playerBar = document.getElementById('playerBar');
  const largeArtworkSection = document.getElementById('largeArtworkSection');
  
  if (index >= 0 && index < songs.length) {
    window.currentSongIndex = index;
    const song = songs[index];
    
    // Get audio and cover from IndexedDB
    const audioFile = await getFile('audioFiles', song.audio);
    const coverFile = await getFile('coverFiles', song.cover);
    
    if (audioFile && coverFile) {
      mainAudio.src = audioFile.data;
      mainAudio.load();
      mainAudio.play();
      
      nowPlayingCover.src = coverFile.data;
      nowPlayingSong.textContent = song.name;
      nowPlayingAuthor.textContent = song.author || '';
      playPauseBtn.textContent = '⏸️';
      
      largeArtwork.src = coverFile.data;
      largeSongName.textContent = song.name;
      largeArtistName.textContent = song.author || '';
      largeArtworkSection.classList.add('visible');
      
      playerBar.classList.remove('hidden');
    }
  }
}

// Toggle play/pause
function togglePlayPause() {
  const mainAudio = document.getElementById('mainAudio');
  const playPauseBtn = document.getElementById('playPauseBtn');
  
  if (mainAudio.paused) {
    mainAudio.play();
    playPauseBtn.textContent = '⏸️';
  } else {
    mainAudio.pause();
    playPauseBtn.textContent = '▶️';
  }
}

// Play next song
function playNextSong() {
  if (!window.songs || window.songs.length === 0) return;
  
  let nextIndex = (window.currentSongIndex + 1) % window.songs.length;
  playSong(nextIndex);
}

// Play previous song
function playPrevSong() {
  if (!window.songs || window.songs.length === 0) return;
  
  let prevIndex = window.currentSongIndex - 1;
  if (prevIndex < 0) prevIndex = window.songs.length - 1;
  playSong(prevIndex);
}

// Delete audio

async function deleteAudio(id, audioFilename, coverFilename) {
  if (confirm('Are you sure you want to delete this audio?')) {
    try {
      // Delete files from IndexedDB
      await deleteEntry('audioFiles', audioFilename);
      await deleteEntry('coverFiles', coverFilename);
      
      // Delete metadata
      await deleteEntry('metadata', id);
      
      // Delete from favorites if exists
      try {
        await deleteEntry('favorites', audioFilename);
      } catch (error) {
        // Ignore if not in favorites
      }
      
      // Handle currently playing song
      const mainAudio = document.getElementById('mainAudio');
      const playerBar = document.getElementById('playerBar');
      const largeArtworkSection = document.getElementById('largeArtworkSection');
      const currentSongAudio = window.songs?.[window.currentSongIndex]?.audio;
      
      

      if (currentSongAudio === audioFilename) {
        mainAudio.pause();
        playerBar.classList.add('hidden');
        largeArtworkSection.classList.remove('visible');
        window.currentSongIndex = -1;
      }
      
      // Reload the file list based on current view
      const showFavoritesBtn = document.getElementById('showFavoritesBtn');
      if (showFavoritesBtn && showFavoritesBtn.classList.contains('active')) {
        await loadFavorites();
      } else {
        await loadFiles();
      }
    } catch (error) {
      console.error('Error deleting audio:', error);
      alert('Error deleting audio. Please try again.');
    }
  }
}


// Delete entry from object store
function deleteEntry(storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);
    
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}

// Toggle favorite

// Helper function to get storage usage statistics
async function displayStorageStats() {
  try {
    const audioFiles = await getAllEntries('audioFiles');
    const coverFiles = await getAllEntries('coverFiles');
    
    // Estimate size (very approximate since base64 encoding is larger than binary)
    let totalSize = 0;
    
    audioFiles.forEach(file => {
      totalSize += file.data.length;
    });
    
    coverFiles.forEach(file => {
      totalSize += file.data.length;
    });
    
    // Convert to MB (approximation)
    const totalMB = (totalSize * 2) / 1024 / 1024;
    
    console.log(`Storage stats: ${audioFiles.length} audio files, using approximately ${totalMB.toFixed(2)}MB of storage`);
    
    return {
      audioCount: audioFiles.length,
      sizeMB: totalMB
    };
  } catch (error) {
    console.error('Error getting storage stats:', error);
    return { audioCount: 0, sizeMB: 0 };
  }
}

// Get all genres for filters
async function loadGenres() {
  const genreFilters = document.getElementById('genreFilters');
  if (!genreFilters) return;
  
  genreFilters.innerHTML = '';
  
  try {
    const entries = await getAllEntries('metadata');
    const genres = [...new Set(entries.map(song => song.genre).filter(Boolean))];
    
    if (genres.length === 0) return;
    
    genres.forEach(genre => {
      const genreTag = document.createElement('div');
      genreTag.className = 'genre-tag';
      genreTag.textContent = genre;
      genreTag.addEventListener('click', () => {
        toggleGenreFilter(genre, genreTag);
      });
      
      genreFilters.appendChild(genreTag);
    });
  } catch (error) {
    console.error('Error loading genres:', error);
  }
}

// Toggle genre filter
function toggleGenreFilter(genre, element) {
  element.classList.toggle('active');
  
  const activeGenres = Array.from(document.querySelectorAll('.genre-tag.active'))
    .map(el => el.textContent);
  
  filterSongs(activeGenres);
}

// Filter songs based on search term and genres
async function filterSongs(activeGenres = []) {
  const searchTerm = window.searchTerm || '';
  
  // Get the appropriate base songs depending on favorites mode
  const showFavoritesBtn = document.getElementById('showFavoritesBtn');
  const isFavoritesMode = showFavoritesBtn && showFavoritesBtn.classList.contains('active');
  
  let baseSongs = [];
  
  if (isFavoritesMode) {
    // Get favorites from IndexedDB
    const favorites = await getAllEntries('favorites');
    const allSongs = window.allSongsData || [];
    
    // Filter songs that are in favorites
    baseSongs = allSongs.filter(entry => 
      favorites.some(fav => fav.audio === entry.audio)
    );
  } else {
    baseSongs = window.allSongsData || [];
  }
  
  let filteredSongs = baseSongs;
  
  // Filter by search term
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filteredSongs = filteredSongs.filter(song => 
      song.name.toLowerCase().includes(term) || 
      (song.author && song.author.toLowerCase().includes(term))
    );
  }
  
  // Filter by genres
  if (activeGenres.length > 0) {
    filteredSongs = filteredSongs.filter(song => 
      song.genre && activeGenres.includes(song.genre)
    );
  }
  
  window.songs = filteredSongs;
  
  // Re-render songs
  const container = document.getElementById('fileList');
  container.innerHTML = '';
  
  if (filteredSongs.length === 0) {
    container.innerHTML = '<p>No matching songs found.</p>';
    return;
  }
  
  renderSongs(filteredSongs);
}


// Album support
async function loadAlbums() {
  const albumGrid = document.getElementById('albumGrid');
  if (!albumGrid) return;

  albumGrid.innerHTML = '';

  try {
    // Get albums from IndexedDB
    const albums = await getAllEntries('albums');

    if (albums.length === 0) {
      albumGrid.innerHTML = '<p>No albums created yet.</p>';
      return;
    }

    for (const album of albums) {
      const albumElement = document.createElement('div');
      albumElement.className = 'album-item';

      // Get cover from IndexedDB
      let coverData = null;
      if (album.cover) {
        const coverFile = await getFile('coverFiles', album.cover);
        if (coverFile) {
          coverData = coverFile.data;
        }
      }

      albumElement.innerHTML = `
        <img class="album-cover" src="${coverData || '/api/placeholder/180/180'}" alt="${album.name}">
        <div class="album-title">${album.name}</div>
        <div class="album-artist">${album.artist || 'Various Artists'}</div>
      `;

      albumElement.addEventListener('click', () => {
        showAlbumDetail(album);
      });

      albumGrid.appendChild(albumElement);
    }
  } catch (error) {
    console.error('Error loading albums:', error);
    albumGrid.innerHTML = '<p>Error loading albums. Please refresh the page.</p>';
  }
}

// Show album detail
async function showAlbumDetail(album) {
  // Your existing code...
  
  // Fix this part - replace albumDetailSongs with albumTracks
  const albumTracks = document.getElementById('albumTracks');
  albumTracks.innerHTML = '';
  
  try {
    const allSongs = await getAllEntries('metadata');
    const albumSongs = album.tracks ? allSongs.filter(song => album.tracks.includes(song.audio)) : [];
    
    if (albumSongs.length === 0) {
      albumTracks.innerHTML = '<p>No songs in this album.</p>';
    } else {
      // Render album songs
      let index = 0;
      for (const song of albumSongs) {
        const songElement = document.createElement('div');
        songElement.className = 'album-track'; // Changed from album-song-item to match CSS
        
        songElement.innerHTML = `
          <div class="track-number">${++index}</div>
          <div class="track-info">
            <div class="track-title">${song.name}</div>
            <div class="song-artist">${song.author || ''}</div>
          </div>
        `;
        
        songElement.addEventListener('click', () => {
          // Play song
          window.songs = albumSongs;
          playSong(albumSongs.indexOf(song));
        });
        
        albumTracks.appendChild(songElement);
      }
    }
    
    // Show album detail view
    document.getElementById('songsView').style.display = 'none';
    document.getElementById('albumsView').style.display = 'none';
    document.getElementById('albumDetailView').style.display = 'block';
  } catch (error) {
    console.error('Error showing album detail:', error);
  }
}

// Show create album dialog
function showCreateAlbumDialog() {
  console.log('showCreateAlbumDialog function called');
  
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.right = '0';
  overlay.style.bottom = '0';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  overlay.style.zIndex = '1001';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';

  const modal = document.createElement('div');
  modal.style.backgroundColor = '#282828';
  modal.style.borderRadius = '8px';
  modal.style.padding = '24px';
  modal.style.width = '80%';
  modal.style.maxWidth = '500px';
  modal.style.maxHeight = '80vh';
  modal.style.overflow = 'auto';

  // Add to DOM before fetching songs to ensure we can see it's working
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  // Show loading indicator
  modal.innerHTML = '<p>Loading songs...</p>';

  // Get all songs for selection
  getAllEntries('metadata').then(allSongs => {
    // Store in a global variable for reference
    window.allSongsData = allSongs;

    modal.innerHTML = `
      <h2 style="margin-top: 0;">Create Album</h2>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px;">Album Name</label>
        <input id="albumNameInput" type="text" style="width: 100%; padding: 8px; background-color: #333; border: 1px solid #535353; color: white; border-radius: 4px;" required>
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px;">Artist</label>
        <input id="albumArtistInput" type="text" style="width: 100%; padding: 8px; background-color: #333; border: 1px solid #535353; color: white; border-radius: 4px;" required>
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px;">Upload Album Cover</label>
        <input id="albumCoverInput" type="file" accept="image/*" style="width: 100%; padding: 8px; background-color: #333; border: 1px solid #535353; color: white; border-radius: 4px;" required>
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px;">Select Tracks</label>
        <div id="trackSelection" style="max-height: 200px; overflow-y: auto; background-color: #333; border: 1px solid #535353; border-radius: 4px; padding: 8px;">
          ${allSongs.map((song, i) => `
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <input type="checkbox" id="track${i}" data-audio="${song.audio}" style="margin-right: 8px;">
              <label for="track${i}">${song.name} - ${song.author || 'Unknown'}</label>
            </div>
          `).join('')}
        </div>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px;">
        <button id="cancelAlbumBtn" style="background-color: transparent; color: white; border: 1px solid #535353; padding: 8px 16px; border-radius: 30px; cursor: pointer;">Cancel</button>
        <button id="createAlbumBtn" style="background-color: #1db954; color: white; border: none; padding: 8px 16px; border-radius: 30px; cursor: pointer; font-weight: bold;">Create Album</button>
      </div>
    `;

    // Now bind events to the elements after they've been added to the DOM
    document.getElementById('cancelAlbumBtn').addEventListener('click', () => {
      document.body.removeChild(overlay);
    });

    document.getElementById('createAlbumBtn').addEventListener('click', async () => {
      const albumName = document.getElementById('albumNameInput').value.trim();
      const albumArtist = document.getElementById('albumArtistInput').value.trim();
      const albumCoverFile = document.getElementById('albumCoverInput').files[0];

      const selectedTracks = [];
      document.querySelectorAll('#trackSelection input[type="checkbox"]:checked').forEach(checkbox => {
        selectedTracks.push(checkbox.dataset.audio);
      });

      if (!albumName || !albumCoverFile || selectedTracks.length === 0) {
        alert('Album name, cover image, and at least one track are required.');
        return;
      }

      try {
        // Convert cover image to Base64
        const albumCoverBase64 = await fileToBase64(albumCoverFile);

        // Generate unique filename for the cover
        const albumCoverFilename = Date.now() + '-album-cover' + getExtension(albumCoverFile.name);

        // Store the cover image in IndexedDB
        await storeFile('coverFiles', { filename: albumCoverFilename, data: albumCoverBase64 });

        // Create album metadata
        const album = {
          name: albumName,
          artist: albumArtist,
          cover: albumCoverFilename,
          tracks: selectedTracks,
          dateCreated: new Date().toISOString(),
        };

        // Store the album in IndexedDB
        const transaction = db.transaction(['albums'], 'readwrite');
        const store = transaction.objectStore('albums');
        const request = store.add(album);

        request.onsuccess = () => {
          document.body.removeChild(overlay);
          loadAlbums();
          alert('Album created successfully!');
        };

        request.onerror = (event) => {
          console.error('Error creating album:', event.target.error);
          alert('Failed to create album. Please try again.');
        };
      } catch (error) {
        console.error('Error creating album:', error);
        alert('Failed to create album. Please try again.');
      }
    });
  }).catch(error => {
    console.error('Error loading songs for album creation:', error);
    modal.innerHTML = '<p>Error loading songs. Please try again.</p>';
    
    // Add a close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.marginTop = '16px';
    closeBtn.style.padding = '8px 16px';
    closeBtn.style.backgroundColor = '#535353';
    closeBtn.style.color = 'white';
    closeBtn.style.border = 'none';
    closeBtn.style.borderRadius = '4px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.onclick = () => document.body.removeChild(overlay);
    
    modal.appendChild(closeBtn);
  });
}




// Get entry by index
function getEntryByIndex(storeName, indexName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.get(key);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initDatabase().then(() => {
    loadFiles();
    loadGenres();
    const albumsViewBtn = document.getElementById('albumsViewBtn');
  if (albumsViewBtn) {
    // Replace any existing listeners
    albumsViewBtn.onclick = function() {
      console.log('Albums view button clicked');
      initializeAlbumsView();
    };
  }

    // Add event listeners for search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        window.searchTerm = e.target.value;
        filterSongs();
      });
    }
    
    // Add audio player controls
    const playPauseBtn = document.getElementById('playPauseBtn');
    const mainAudio = document.getElementById('mainAudio');
    
    if (playPauseBtn && mainAudio) {
      playPauseBtn.addEventListener('click', togglePlayPause);
      
      // Update play/pause button based on audio state
      mainAudio.addEventListener('play', () => {
        playPauseBtn.textContent = '⏸️';
      });
      
      mainAudio.addEventListener('pause', () => {
        playPauseBtn.textContent = '▶️';
      });
    }
    
    // Previous and next buttons
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (prevBtn) {
      prevBtn.addEventListener('click', playPrevSong);
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', playNextSong);
    }
    
    // Favorites button
    const showFavoritesBtn = document.getElementById('showFavoritesBtn');
    if (showFavoritesBtn) {
      showFavoritesBtn.addEventListener('click', toggleFavoritesView);
    }
    
    // Album view toggle buttons
    const songsViewBtn = document.getElementById('songsViewBtn');
    
    if (songsViewBtn && albumsViewBtn) {
      songsViewBtn.addEventListener('click', () => {  
        document.getElementById('songsView').style.display = 'block';
        document.getElementById('albumsView').style.display = 'none';
        document.getElementById('albumDetailView').style.display = 'none';
        songsViewBtn.classList.add('active');
        albumsViewBtn.classList.remove('active');
      });
      
      albumsViewBtn.addEventListener('click', () => {
        document.getElementById('songsView').style.display = 'none';
        document.getElementById('albumsView').style.display = 'block';
        document.getElementById('albumDetailView').style.display = 'none';
        songsViewBtn.classList.remove('active');
        albumsViewBtn.classList.add('active');
        loadAlbums();
      });
    }
    
    // Back button for album detail view
    const albumDetailBackBtn = document.getElementById('albumDetailBackBtn');
    if (albumDetailBackBtn) {
      albumDetailBackBtn.addEventListener('click', () => {
        document.getElementById('albumDetailView').style.display = 'none';
        document.getElementById('albumsView').style.display = 'block';
      });
    }
  });
});
const albumsViewBtn = document.getElementById('albumsViewBtn');
if (albumsViewBtn) {
  albumsViewBtn.addEventListener('click', () => {
    // Your existing code...
    
    // Add this: Create "Create Album" button
    const albumGrid = document.getElementById('albumGrid');
    if (albumGrid && !document.getElementById('createAlbumBtn')) {
      const createBtn = document.createElement('button');
      createBtn.id = 'createAlbumBtn';
      createBtn.textContent = 'Create Album';
      createBtn.style.marginBottom = '20px';
      createBtn.addEventListener('click', showCreateAlbumDialog);
      albumGrid.parentNode.insertBefore(createBtn, albumGrid);
    }
  });
}


  function initializeAlbumsView() {
  // Switch to albums view
  document.getElementById('songsView').style.display = 'none';
  document.getElementById('albumsView').style.display = 'block';
  document.getElementById('albumDetailView').style.display = 'none';
  
  // Add "Create Album" button if it doesn't exist
  const albumGrid = document.getElementById('albumGrid');
  if (albumGrid) {
    // First remove any existing button to avoid duplicates
    const existingBtn = document.getElementById('createAlbumBtn');
    if (existingBtn) {
      existingBtn.remove();
    }
    
    const createBtn = document.createElement('button');
    createBtn.id = 'createAlbumBtn';
    createBtn.textContent = 'Create Album';
    createBtn.style.marginBottom = '20px';
    createBtn.style.backgroundColor = '#1db954';
    createBtn.style.color = 'white';
    createBtn.style.border = 'none';
    createBtn.style.padding = '8px 16px';
    createBtn.style.borderRadius = '30px';
    createBtn.style.cursor = 'pointer';
    createBtn.style.fontWeight = 'bold';
    
    // Direct inline function to avoid reference issues
    createBtn.onclick = function() {
      console.log('Create Album button clicked');
      showCreateAlbumDialog();
    };
    
    // Insert before album grid
    albumGrid.parentNode.insertBefore(createBtn, albumGrid);
  }
  
  // Load the albums
  loadAlbums();
}



    function formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

function updateProgress() {
  if (mainAudio.duration) {
    const percentage = (mainAudio.currentTime / mainAudio.duration) * 100;
    progressFill.style.width = `${percentage}%`;
    currentTimeDisplay.textContent = formatTime(mainAudio.currentTime);
    durationDisplay.textContent = formatTime(mainAudio.duration);
  }
}

    mainAudio.addEventListener('timeupdate', updateProgress);
    
    progress.addEventListener('click', function(e) {
      const percent = e.offsetX / progress.offsetWidth;
      mainAudio.currentTime = percent * mainAudio.duration;
      updateProgress();
    });



    // Album views and filters - adapted for IndexedDB

// Initialize albums view with proper event handlers
function initializeAlbumsView() {
  // Switch to albums view
  document.getElementById('songsView').style.display = 'none';
  document.getElementById('albumsView').style.display = 'block';
  document.getElementById('albumDetailView').style.display = 'none';
  
  const songsViewBtn = document.getElementById('songsViewBtn');
  const albumsViewBtn = document.getElementById('albumsViewBtn');
  
  if (songsViewBtn && albumsViewBtn) {
    songsViewBtn.classList.remove('active');
    albumsViewBtn.classList.add('active');
  }
  
  // Add "Create Album" button if it doesn't exist
  const albumGrid = document.getElementById('albumGrid');
  if (albumGrid) {
    // First remove any existing button to avoid duplicates
    const existingBtn = document.getElementById('createAlbumBtn');
    if (existingBtn) {
      existingBtn.remove();
    }
    
    const createBtn = document.createElement('button');
    createBtn.id = 'createAlbumBtn';
    createBtn.textContent = 'Create Album';
    createBtn.style.marginBottom = '20px';
    createBtn.style.backgroundColor = '#1db954';
    createBtn.style.color = 'white';
    createBtn.style.border = 'none';
    createBtn.style.padding = '8px 16px';
    createBtn.style.borderRadius = '30px';
    createBtn.style.cursor = 'pointer';
    createBtn.style.fontWeight = 'bold';
    
    // Direct inline function to avoid reference issues
    createBtn.onclick = function() {
      console.log('Create Album button clicked');
      showCreateAlbumDialog();
    };
    
    // Insert before album grid
    albumGrid.parentNode.insertBefore(createBtn, albumGrid);
  }
  
  // Load the albums
  loadAlbums();
}

// Updated function to filter album tracks 
function filterAlbumTracks(currentAlbum, searchTerm = '', activeGenres = []) {
  if (!currentAlbum) return;
  
  const albumTracks = document.getElementById('albumTracks');
  if (!albumTracks) return;
  
  const searchLower = searchTerm.toLowerCase();
  albumTracks.innerHTML = '';
  
  // Get all songs from the database
  getAllEntries('metadata').then(allSongs => {
    // Filter songs that are in the current album
    const albumSongs = currentAlbum.tracks
      .map(trackId => {
        return allSongs.find(song => song.audio === trackId);
      })
      .filter(song => song); 
    
    // Apply search and genre filters
    const filteredAlbumSongs = albumSongs.filter(song => {
      const matchesSearch = 
        song.name.toLowerCase().includes(searchLower) || 
        (song.author && song.author.toLowerCase().includes(searchLower));
      
      const matchesGenre = 
        activeGenres.length === 0 || 
        (song.genre && activeGenres.includes(song.genre));
      
      return matchesSearch && matchesGenre;
    });
    
    if (filteredAlbumSongs.length === 0) {
      albumTracks.innerHTML = '<p>No tracks match your search criteria.</p>';
      return;
    }
    
    // Render the filtered tracks
    filteredAlbumSongs.forEach((song, index) => {
      const trackElement = document.createElement('div');
      trackElement.className = 'album-track';
      
      trackElement.innerHTML = `
        <div class="track-number">${index + 1}</div>
        <div class="track-info">
          <div class="track-title">${song.name}</div>
          <div class="track-artist">${song.author || ''}</div>
          ${song.genre ? `<div class="track-genre" style="color: rgba(255, 255, 255, 0.5); font-size: 0.8em;">${song.genre}</div>` : ''}
        </div>
      `;
      
      trackElement.addEventListener('click', () => {
        // Set the songs array to filtered album songs for proper playback context
        window.songs = filteredAlbumSongs;
        playSong(index);
      });
      
      albumTracks.appendChild(trackElement);
    });
  }).catch(error => {
    console.error('Error loading album tracks:', error);
    albumTracks.innerHTML = '<p>Error loading tracks. Please try again.</p>';
  });
}

// Updated function to show album detail
async function showAlbumDetail(album) {
  // Store current album in window for reference
  window.currentAlbum = album;
  
  document.getElementById('songsView').style.display = 'none';
  document.getElementById('albumsView').style.display = 'none';
  document.getElementById('albumDetailView').style.display = 'block';
  
  // Update album cover and metadata
  const albumCover = document.getElementById('albumCover');
  const albumTitle = document.getElementById('albumTitle');
  const albumArtist = document.getElementById('albumArtist');
  
  if (albumCover && albumTitle && albumArtist) {
    // Get cover from IndexedDB
    if (album.cover) {
      try {
        const coverFile = await getFile('coverFiles', album.cover);
        if (coverFile) {
          albumCover.src = coverFile.data;
        } else {
          albumCover.src = '/api/placeholder/150/150';
        }
      } catch (error) {
        console.error('Error loading album cover:', error);
        albumCover.src = '/api/placeholder/150/150';
      }
    } else {
      albumCover.src = '/api/placeholder/150/150';
    }
    
    albumTitle.textContent = album.name;
    albumArtist.textContent = album.artist || 'Various Artists';
  }
  
  // Filter tracks based on current search and genre filters
  const searchTerm = window.searchTerm || '';
  const activeGenres = Array.from(document.querySelectorAll('.genre-tag.active'))
    .map(el => el.textContent);
  
  filterAlbumTracks(album, searchTerm, activeGenres);
}

// Connect search input to album track filtering
function setupSearchForAlbums() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    // Update or add event listener
    const oldListener = searchInput.onchange || searchInput.oninput;
    
    searchInput.addEventListener('input', (e) => {
      window.searchTerm = e.target.value;
      
      // Call original listener if exists
      if (typeof oldListener === 'function') {
        oldListener.call(searchInput, e);
      }
      
      // Also filter album tracks if in album detail view
      const albumDetailView = document.getElementById('albumDetailView');
      if (albumDetailView && albumDetailView.style.display !== 'none' && window.currentAlbum) {
        const activeGenres = Array.from(document.querySelectorAll('.genre-tag.active'))
          .map(el => el.textContent);
        filterAlbumTracks(window.currentAlbum, window.searchTerm, activeGenres);
      }
    });
  }
}

// Connect genre filters to album track filtering
function setupGenreFiltersForAlbums() {
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('genre-tag')) {
      // If we're in album detail view, refilter tracks
      const albumDetailView = document.getElementById('albumDetailView');
      if (albumDetailView && albumDetailView.style.display !== 'none' && window.currentAlbum) {
        const searchTerm = window.searchTerm || '';
        const activeGenres = Array.from(document.querySelectorAll('.genre-tag.active'))
          .map(el => el.textContent);
        filterAlbumTracks(window.currentAlbum, searchTerm, activeGenres);
      }
    }
  });
}

// Initialize the albums functionality
document.addEventListener('DOMContentLoaded', () => {
  initDatabase().then(() => {
    // Rest of your initialization code
    
    // Add navigation between views
    const songsViewBtn = document.getElementById('songsViewBtn');
    const albumsViewBtn = document.getElementById('albumsViewBtn');
const backToAlbumsBtn = document.getElementById('backToAlbumsBtn');
    
    if (songsViewBtn) {
      songsViewBtn.addEventListener('click', () => {
        document.getElementById('songsView').style.display = 'block';
        document.getElementById('albumsView').style.display = 'none';
        document.getElementById('albumDetailView').style.display = 'none';
        songsViewBtn.classList.add('active');
        if (albumsViewBtn) albumsViewBtn.classList.remove('active');
      });
    }
    
    if (albumsViewBtn) {
      albumsViewBtn.addEventListener('click', initializeAlbumsView);
    }
    
    if (backToAlbumsBtn) {
  backToAlbumsBtn.addEventListener('click', () => {
    document.getElementById('albumDetailView').style.display = 'none';
    document.getElementById('albumsView').style.display = 'block';
  });
}
    // Setup search and filters to work with albums
    setupSearchForAlbums();
    setupGenreFiltersForAlbums();
  });
});