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

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('movies');
  const searchInput = document.getElementById('searchInput');
  const genreFilter = document.getElementById('genreFilter');
  const yearFilter = document.getElementById('yearFilter');
  const typeFilter = document.getElementById('typeFilter');
  const clearFilters = document.getElementById('clearFilters');
  const resultsCount = document.getElementById('resultsCount');

  const detailModal = document.getElementById('detailModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const closeModalBackdrop = document.getElementById('closeModalBackdrop');

  const modalPoster = document.getElementById('modalPoster');
  const modalTitle = document.getElementById('modalTitle');
  const modalMeta = document.getElementById('modalMeta');
  const modalGenres = document.getElementById('modalGenres');
  const modalDescription = document.getElementById('modalDescription');
  const modalWatchBtn = document.getElementById('modalWatchBtn');

  container.innerHTML = '<p class="loading">Cargando contenido...</p>';

  try {
    const response = await fetch('/api/movies');

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    allMovies = await response.json();

    fillFilters(allMovies);
    renderMovies(allMovies);

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
    });

    closeModalBtn.addEventListener('click', closeModal);
    closeModalBackdrop.addEventListener('click', closeModal);

  } catch (error) {
    console.error('Error cargando contenido:', error);
    container.innerHTML = '<p class="error">Error al cargar el contenido.</p>';
    if (resultsCount) resultsCount.textContent = '';
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
    modalPoster.src = movie.backdrop || movie.poster || 'https://via.placeholder.com/800x450?text=Sin+imagen';
    modalPoster.alt = movie.title || 'Sin título';
    modalTitle.textContent = movie.title || 'Sin título';

    modalMeta.textContent =
      `${movie.type || 'contenido'} • ${movie.year || 'Sin año'}${movie.rating ? ` • ⭐ ${Number(movie.rating).toFixed(1)}` : ''}`;

    modalGenres.innerHTML = (movie.genre || [])
      .map(g => `<span class="tag">${g}</span>`)
      .join('');

    modalDescription.textContent = movie.description || 'Sin descripción disponible.';
    modalWatchBtn.href = movie.telegram_link || '#';

    detailModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    detailModal.classList.add('hidden');
    document.body.style.overflow = '';
  }
});
