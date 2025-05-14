
const DB_NAME = 'audioPlayerDB';
const DB_VERSION = 1;
let db;
async function toggleFavoritesView() {
  const showFavoritesBtn = document.getElementById('showFavoritesBtn');
  const isFavoritesMode = showFavoritesBtn.classList.toggle('active');

  if (isFavoritesMode) {
    showFavoritesBtn.textContent = 'Show All';
    await loadFavorites();
  } else {
    showFavoritesBtn.textContent = 'Show Favorites';
    await loadFiles();
  }
}


async function toggleFavorite(audioFilename) {
  try {
    const transaction = db.transaction(['favorites'], 'readwrite');
    const store = transaction.objectStore('favorites');

    const getRequest = store.get(audioFilename);

    getRequest.onsuccess = async (event) => {
      const isFavorite = !!event.target.result;
      
      if (isFavorite) {
        store.delete(audioFilename);
      } else {
        store.add({ audio: audioFilename });
      }

      const favoriteBtn = document.querySelector(`.song-item button.favorite-btn[data-audio="${audioFilename}"]`);
      if (favoriteBtn) {
        favoriteBtn.innerHTML = isFavorite ? '☆' : '★';
        favoriteBtn.classList.toggle('active', !isFavorite);
      }

      transaction.oncomplete = async () => {
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

async function loadFavorites() {
  const container = document.getElementById('fileList');
  if (!container) return;

  container.innerHTML = '';

  try {
    const favorites = await getAllEntries('favorites');
    
    if (favorites.length === 0) {
      container.innerHTML = '<p>No favorite songs yet.</p>';
      return;
    }

    const allEntries = await getAllEntries('metadata');
    
    const favoriteSongs = allEntries.filter(entry => 
      favorites.some(fav => fav.audio === entry.audio)
    );

    if (favoriteSongs.length === 0) {
      container.innerHTML = '<p>No favorite songs found.</p>';
      return;
    }

    window.songs = favoriteSongs;
    
    renderSongs(favoriteSongs);
  } catch (error) {
    console.error('Error loading favorites:', error);
    container.innerHTML = '<p>Error loading favorites. Please try again.</p>';
  }
}

async function loadFiles() {
  const container = document.getElementById('fileList');
  if (!container) return;

  container.innerHTML = '';

  try {
    const entries = await getAllEntries('metadata');

    const renderedFiles = new Set();
    const uniqueEntries = entries.filter(entry => {
      if (renderedFiles.has(entry.audio)) {
        return false; 
      }
      renderedFiles.add(entry.audio);
      return true;
    });

    if (uniqueEntries.length === 0) {
      container.innerHTML = '<p>No audio files uploaded yet.</p>';
      return;
    }

    window.allSongsData = uniqueEntries;
    window.songs = uniqueEntries;

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
      
      albumsViewBtn.addEventListener('click', () => {
        initializeAlbumsView();
        songsViewBtn.classList.remove('active');
        albumsViewBtn.classList.add('active');
      });
    }
    
    const backToAlbumsBtn = document.getElementById('backToAlbumsBtn');
    if (backToAlbumsBtn) {
      backToAlbumsBtn.addEventListener('click', () => {
        document.getElementById('albumDetailView').style.display = 'none';
        document.getElementById('albumsView').style.display = 'block';
      });
    }
    
  });
});

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

document.getElementById('uploadForm').onsubmit = async (e) => {
  e.preventDefault();
  const form = e.target;

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
    const audioBase64 = await fileToBase64(audioFile);
    const coverBase64 = await fileToBase64(coverFile);

    const audioFilename = Date.now() + '-audio' + getExtension(audioFile.name);
    const coverFilename = Date.now() + '-cover' + getExtension(coverFile.name);

    await storeFile('audioFiles', { filename: audioFilename, data: audioBase64 });
    await storeFile('coverFiles', { filename: coverFilename, data: coverBase64 });

    await storeMetadata({
      name,
      author,
      genre,
      audio: audioFilename,
      cover: coverFilename,
      dateAdded: new Date().toISOString(),
    });

    form.reset();
    await loadFiles();
    alert('Song uploaded successfully!');
  } catch (error) {
    console.error('Error uploading song:', error);
    alert('Failed to upload song. Please try again.');
  }
};

function getExtension(filename) {
  return '.' + filename.split('.').pop();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File conversion failed'));
    reader.readAsDataURL(file);
  });
}

function storeFile(storeName, fileObj) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(fileObj);
    
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}

function storeMetadata(entry) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['metadata'], 'readwrite');
    const store = transaction.objectStore('metadata');
    const request = store.add(entry);
    
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}

function getAllEntries(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

function getFile(storeName, filename) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(filename);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

async function renderSongs(songsToRender) {
  const container = document.getElementById('fileList');
  const favorites = await getAllEntries('favorites');
  const favoriteIds = favorites.map(fav => fav.audio);

  container.innerHTML = ''; 

  if (songsToRender.length === 0) {
    container.innerHTML = '<p>No songs found.</p>';
    return;
  }

  for (const song of songsToRender) {
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
    favBtn.dataset.audio = song.audio; 
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

function playNextSong() {
  if (!window.songs || window.songs.length === 0) return;
  
  let nextIndex = (window.currentSongIndex + 1) % window.songs.length;
  playSong(nextIndex);
}

function playPrevSong() {
  if (!window.songs || window.songs.length === 0) return;
  
  let prevIndex = window.currentSongIndex - 1;
  if (prevIndex < 0) prevIndex = window.songs.length - 1;
  playSong(prevIndex);
}


async function deleteAudio(id, audioFilename, coverFilename) {
  if (confirm('Are you sure you want to delete this audio?')) {
    try {
      await deleteEntry('audioFiles', audioFilename);
      await deleteEntry('coverFiles', coverFilename);
      
      await deleteEntry('metadata', id);
      
      try {
        await deleteEntry('favorites', audioFilename);
      } catch (error) {
      }
      
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


function deleteEntry(storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);
    
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}

async function displayStorageStats() {
  try {
    const audioFiles = await getAllEntries('audioFiles');
    const coverFiles = await getAllEntries('coverFiles');
    
    let totalSize = 0;
    
    audioFiles.forEach(file => {
      totalSize += file.data.length;
    });
    
    coverFiles.forEach(file => {
      totalSize += file.data.length;
    });
    
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

function toggleGenreFilter(genre, element) {
  element.classList.toggle('active');
  
  const activeGenres = Array.from(document.querySelectorAll('.genre-tag.active'))
    .map(el => el.textContent);
  
  filterSongs(activeGenres);
}

async function filterSongs(activeGenres = []) {
  const searchTerm = window.searchTerm || '';
  
  const showFavoritesBtn = document.getElementById('showFavoritesBtn');
  const isFavoritesMode = showFavoritesBtn && showFavoritesBtn.classList.contains('active');
  
  let baseSongs = [];
  
  if (isFavoritesMode) {
    const favorites = await getAllEntries('favorites');
    const allSongs = window.allSongsData || [];
    
    baseSongs = allSongs.filter(entry => 
      favorites.some(fav => fav.audio === entry.audio)
    );
  } else {
    baseSongs = window.allSongsData || [];
  }
  
  let filteredSongs = baseSongs;
  
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filteredSongs = filteredSongs.filter(song => 
      song.name.toLowerCase().includes(term) || 
      (song.author && song.author.toLowerCase().includes(term))
    );
  }
  
  if (activeGenres.length > 0) {
    filteredSongs = filteredSongs.filter(song => 
      song.genre && activeGenres.includes(song.genre)
    );
  }
  
  window.songs = filteredSongs;
  
  const container = document.getElementById('fileList');
  container.innerHTML = '';
  
  if (filteredSongs.length === 0) {
    container.innerHTML = '<p>No matching songs found.</p>';
    return;
  }
  
  renderSongs(filteredSongs);
}


async function loadAlbums() {
  const albumGrid = document.getElementById('albumGrid');
  if (!albumGrid) return;

  albumGrid.innerHTML = '';

  try {
    const albums = await getAllEntries('albums');

    if (albums.length === 0) {
      albumGrid.innerHTML = '<p>No albums created yet.</p>';
      return;
    }

    for (const album of albums) {
      const albumElement = document.createElement('div');
      albumElement.className = 'album-item';

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

async function showAlbumDetail(album) {
  const albumTracks = document.getElementById('albumTracks');
  albumTracks.innerHTML = '';
  
  try {
    const allSongs = await getAllEntries('metadata');
    const albumSongs = album.tracks ? allSongs.filter(song => album.tracks.includes(song.audio)) : [];
    
    if (albumSongs.length === 0) {
      albumTracks.innerHTML = '<p>No songs in this album.</p>';
    } else {
      let index = 0;
      for (const song of albumSongs) {
        const songElement = document.createElement('div');
        songElement.className = 'album-track';
        
        songElement.innerHTML = `
          <div class="track-number">${++index}</div>
          <div class="track-info">
            <div class="track-title">${song.name}</div>
            <div class="song-artist">${song.author || ''}</div>
          </div>
        `;
        
        songElement.addEventListener('click', () => {
          window.songs = albumSongs;
          playSong(albumSongs.indexOf(song));
        });
        
        albumTracks.appendChild(songElement);
      }
    }
    
    document.getElementById('songsView').style.display = 'none';
    document.getElementById('albumsView').style.display = 'none';
    document.getElementById('albumDetailView').style.display = 'block';
  } catch (error) {
    console.error('Error showing album detail:', error);
  }
}

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

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  modal.innerHTML = '<p>Loading songs...</p>';

  getAllEntries('metadata').then(allSongs => {
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
        const albumCoverBase64 = await fileToBase64(albumCoverFile);

        const albumCoverFilename = Date.now() + '-album-cover' + getExtension(albumCoverFile.name);

        await storeFile('coverFiles', { filename: albumCoverFilename, data: albumCoverBase64 });

        const album = {
          name: albumName,
          artist: albumArtist,
          cover: albumCoverFilename,
          tracks: selectedTracks,
          dateCreated: new Date().toISOString(),
        };

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

document.addEventListener('DOMContentLoaded', () => {
  initDatabase().then(() => {
    loadFiles();
    loadGenres();
    const albumsViewBtn = document.getElementById('albumsViewBtn');
  if (albumsViewBtn) {
    albumsViewBtn.onclick = function() {
      console.log('Albums view button clicked');
      initializeAlbumsView();
    };
  }

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        window.searchTerm = e.target.value;
        filterSongs();
      });
    }
    
    const playPauseBtn = document.getElementById('playPauseBtn');
    const mainAudio = document.getElementById('mainAudio');
    
    if (playPauseBtn && mainAudio) {
      playPauseBtn.addEventListener('click', togglePlayPause);
      
      mainAudio.addEventListener('play', () => {
        playPauseBtn.textContent = '⏸️';
      });
      
      mainAudio.addEventListener('pause', () => {
        playPauseBtn.textContent = '▶️';
      });
    }
    
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (prevBtn) {
      prevBtn.addEventListener('click', playPrevSong);
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', playNextSong);
    }
    
    const showFavoritesBtn = document.getElementById('showFavoritesBtn');
    if (showFavoritesBtn) {
      showFavoritesBtn.addEventListener('click', toggleFavoritesView);
    }
    
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
  document.getElementById('songsView').style.display = 'none';
  document.getElementById('albumsView').style.display = 'block';
  document.getElementById('albumDetailView').style.display = 'none';
  
  const albumGrid = document.getElementById('albumGrid');
  if (albumGrid) {
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
    
    createBtn.onclick = function() {
      console.log('Create Album button clicked');
      showCreateAlbumDialog();
    };
    
    albumGrid.parentNode.insertBefore(createBtn, albumGrid);
  }
  
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



function initializeAlbumsView() {
  document.getElementById('songsView').style.display = 'none';
  document.getElementById('albumsView').style.display = 'block';
  document.getElementById('albumDetailView').style.display = 'none';
  
  const songsViewBtn = document.getElementById('songsViewBtn');
  const albumsViewBtn = document.getElementById('albumsViewBtn');
  
  if (songsViewBtn && albumsViewBtn) {
    songsViewBtn.classList.remove('active');
    albumsViewBtn.classList.add('active');
  }
  
  const albumGrid = document.getElementById('albumGrid');
  if (albumGrid) {
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
    
    createBtn.onclick = function() {
      console.log('Create Album button clicked');
      showCreateAlbumDialog();
    };
    
    albumGrid.parentNode.insertBefore(createBtn, albumGrid);
  }
  
  loadAlbums();
}

function filterAlbumTracks(currentAlbum, searchTerm = '', activeGenres = []) {
  if (!currentAlbum) return;
  
  const albumTracks = document.getElementById('albumTracks');
  if (!albumTracks) return;
  
  const searchLower = searchTerm.toLowerCase();
  albumTracks.innerHTML = '';
  
  getAllEntries('metadata').then(allSongs => {
    const albumSongs = currentAlbum.tracks
      .map(trackId => {
        return allSongs.find(song => song.audio === trackId);
      })
      .filter(song => song); 
    
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

async function showAlbumDetail(album) {
  window.currentAlbum = album;
  
  document.getElementById('songsView').style.display = 'none';
  document.getElementById('albumsView').style.display = 'none';
  document.getElementById('albumDetailView').style.display = 'block';
  
  const albumCover = document.getElementById('albumCover');
  const albumTitle = document.getElementById('albumTitle');
  const albumArtist = document.getElementById('albumArtist');
  
  if (albumCover && albumTitle && albumArtist) {
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
  
  const searchTerm = window.searchTerm || '';
  const activeGenres = Array.from(document.querySelectorAll('.genre-tag.active'))
    .map(el => el.textContent);
  
  filterAlbumTracks(album, searchTerm, activeGenres);
}

function setupSearchForAlbums() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    const oldListener = searchInput.onchange || searchInput.oninput;
    
    searchInput.addEventListener('input', (e) => {
      window.searchTerm = e.target.value;
      
      if (typeof oldListener === 'function') {
        oldListener.call(searchInput, e);
      }
      
      const albumDetailView = document.getElementById('albumDetailView');
      if (albumDetailView && albumDetailView.style.display !== 'none' && window.currentAlbum) {
        const activeGenres = Array.from(document.querySelectorAll('.genre-tag.active'))
          .map(el => el.textContent);
        filterAlbumTracks(window.currentAlbum, window.searchTerm, activeGenres);
      }
    });
  }
}

function setupGenreFiltersForAlbums() {
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('genre-tag')) {
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

document.addEventListener('DOMContentLoaded', () => {
  initDatabase().then(() => {
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
    setupSearchForAlbums();
    setupGenreFiltersForAlbums();
  });
});
