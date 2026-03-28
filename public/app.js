const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();

  try {
    tg.setHeaderColor('#141414');
    tg.setBackgroundColor('#141414');
  } catch (e) {}

  if (typeof tg.disableVerticalSwipes === 'function') {
    tg.disableVerticalSwipes();
  }
}

let allMovies = [];
let featuredMovie = null;

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('movies');
  const searchInput = document.getElementById('searchInput');
  const genreFilter = document.getElementById('genreFilter');
  const yearFilter = document.getElementById('yearFilter');
  const typeFilter = document.getElementById('typeFilter');
  const clearFilters = document.getElementById('clearFilters');
  const resultsCount = document.getElementById('resultsCount');

  const heroSection = document.getElementById('heroSection');
  const heroTitle = document.getElementById('heroTitle');
  const heroMeta = document.getElementById('heroMeta');
  const heroGenres = document.getElementById('heroGenres');
  const heroDescription = document.getElementById('heroDescription');
  const heroWatchBtn = document.getElementById('heroWatchBtn');
  const heroInfoBtn = document.getElementById('heroInfoBtn');

  const detailModal = document.getElementById('detailModal');
  const closeModalBtn = document.getElementById('closeModalBtn');

  const modalPoster = document.getElementById('modalPoster');
  const modalTitle = document.getElementById('modalTitle');
  const modalMeta = document.getElementById('modalMeta');
  const modalGenres = document.getElementById('modalGenres');
  const modalDescription = document.getElementById('modalDescription');
  const modalWatchBtn = document.getElementById('modalWatchBtn');
  const modalTrailerBtn = document.getElementById('modalTrailerBtn');

  container.innerHTML = '<p class="loading">Cargando contenido...</p>';

  try {
    const response = await fetch('/api/movies');

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    allMovies = await response.json();

    fillFilters(allMovies);
    renderMovies(allMovies);
    setupFeaturedMovie(allMovies);

    searchInput.addEventListener('input', applyFilters);
    genreFilter.addEventListener('change', applyFilters);
    yearFilter.addEventListener('change', applyFilters);
    typeFilter.addEventListener('change', applyFilters);

    clearFilters.addEventListener('click', () => {
      searchInput.value = '';
      genreFilter.value = '';
      yearFilter.value = '';
      typeFilter.value = '';
      renderMovies(allMovies);
      setupFeaturedMovie(allMovies);
    });

    closeModalBtn.addEventListener('click', closeModal);

    heroInfoBtn.addEventListener('click', () => {
      if (featuredMovie) openModal(featuredMovie);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    });

  } catch (error) {
    console.error('Error cargando contenido:', error);
    container.innerHTML = '<p class="error">Error al cargar el contenido.</p>';
    if (resultsCount) resultsCount.textContent = '';
  }

  function setupFeaturedMovie(movies) {
    if (!movies || movies.length === 0) return;

    const withBackdrop = movies.filter(movie => movie.backdrop);
    const source = withBackdrop.length > 0 ? withBackdrop : movies;

    featuredMovie = source[Math.floor(Math.random() * source.length)];

    const bgImage = featuredMovie.backdrop || featuredMovie.poster || 'https://via.placeholder.com/1200x700?text=Sin+imagen';
    heroSection.style.backgroundImage = `
      linear-gradient(90deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.52) 48%, rgba(0,0,0,0.20) 100%),
      url('${bgImage}')
    `;

    heroTitle.textContent = featuredMovie.title || 'Sin título';

    heroMeta.textContent =
      `${featuredMovie.type || 'contenido'} • ${featuredMovie.year || 'Sin año'}${featuredMovie.rating ? ` • ⭐ ${Number(featuredMovie.rating).toFixed(1)}` : ''}`;

    heroGenres.innerHTML = (featuredMovie.genre || [])
      .slice(0, 4)
      .map(g => `<span class="tag">${g}</span>`)
      .join('');

    heroDescription.textContent =
      featuredMovie.description || 'Sin descripción disponible.';

    heroWatchBtn.href = featuredMovie.telegram_link || '#';
  }

  function fillFilters(movies) {
    const genres = [...new Set(movies.flatMap(movie => movie.genre || []))].sort();
    const years = [...new Set(movies.map(movie => movie.year).filter(Boolean))].sort((a, b) => b - a);

    genreFilter.innerHTML = '<option value="">Todos los géneros</option>';
    yearFilter.innerHTML = '<option value="">Todos los años</option>';

    genres.forEach(genre => {
      const option = document.createElement('option');
      option.value = genre;
      option.textContent = genre;
      genreFilter.appendChild(option);
    });

    years.forEach(year => {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      yearFilter.appendChild(option);
    });
  }

  function applyFilters() {
    const search = searchInput.value.toLowerCase().trim();
    const genre = genreFilter.value;
    const year = yearFilter.value;
    const type = typeFilter.value;

    const filtered = allMovies.filter(movie => {
      const matchesSearch =
        !search ||
        (movie.title && movie.title.toLowerCase().includes(search));

      const matchesGenre =
        !genre ||
        (movie.genre && movie.genre.includes(genre));

      const matchesYear =
        !year ||
        String(movie.year) === String(year);

      const matchesType =
        !type ||
        movie.type === type;

      return matchesSearch && matchesGenre && matchesYear && matchesType;
    });

    renderMovies(filtered);
    setupFeaturedMovie(filtered.length ? filtered : allMovies);
  }

  function renderMovies(movies) {
    container.innerHTML = '';

    if (resultsCount) {
      resultsCount.textContent = `${movies.length} resultado${movies.length === 1 ? '' : 's'}`;
    }

    if (!Array.isArray(movies) || movies.length === 0) {
      container.innerHTML = '<p class="empty">No se encontró contenido con esos filtros.</p>';
      return;
    }

    movies.forEach(movie => {
      const card = document.createElement('article');
      card.className = 'card';

      const genresHtml = (movie.genre || [])
        .slice(0, 3)
        .map(g => `<span class="tag">${g}</span>`)
        .join('');

      card.innerHTML = `
        <div class="poster-wrap">
          <img
            src="${movie.poster || 'https://via.placeholder.com/300x450?text=Sin+imagen'}"
            alt="${movie.title || 'Sin título'}"
            onerror="this.src='https://via.placeholder.com/300x450?text=Sin+imagen'"
          >
          <span class="type-badge">${movie.type || 'contenido'}</span>
        </div>

        <div class="card-content">
          <h3>${movie.title || 'Sin título'}</h3>

          <div class="meta">
            ${movie.year || 'Sin año'}${movie.rating ? ` • ⭐ ${Number(movie.rating).toFixed(1)}` : ''}
          </div>

          <div class="tags">
            ${genresHtml}
          </div>

          <button class="details-btn">Ver en Telegram</button>
        </div>
      `;

      card.querySelector('.details-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openModal(movie);
      });

      card.addEventListener('click', () => {
        openModal(movie);
      });

      container.appendChild(card);
    });
  }

  function openModal(movie) {
    modalPoster.src = movie.backdrop || movie.poster || 'https://via.placeholder.com/1200x700?text=Sin+imagen';
    modalPoster.alt = movie.title || 'Sin título';
    modalTitle.textContent = movie.title || 'Sin título';

    modalMeta.textContent =
      `${movie.type || 'contenido'} • ${movie.year || 'Sin año'}${movie.rating ? ` • ⭐ ${Number(movie.rating).toFixed(1)}` : ''}`;

    modalGenres.innerHTML = (movie.genre || [])
      .map(g => `<span class="tag">${g}</span>`)
      .join('');

    modalDescription.textContent = movie.description || 'Sin descripción disponible.';
    modalWatchBtn.href = movie.telegram_link || '#';

    if (movie.trailer_url) {
      modalTrailerBtn.href = movie.trailer_url;
      modalTrailerBtn.classList.remove('hidden');
    } else {
      modalTrailerBtn.classList.add('hidden');
      modalTrailerBtn.removeAttribute('href');
    }

    detailModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    if (tg && typeof tg.BackButton !== 'undefined') {
      tg.BackButton.show();
      tg.BackButton.onClick(closeModal);
    }
  }

  function closeModal() {
    detailModal.classList.add('hidden');
    document.body.style.overflow = '';

    if (tg && typeof tg.BackButton !== 'undefined') {
      tg.BackButton.hide();
    }
  }
});
