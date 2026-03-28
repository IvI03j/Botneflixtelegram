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

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('movies');
  container.innerHTML = '<p class="loading">Cargando contenido...</p>';

  try {
    const response = await fetch('/api/movies');

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const movies = await response.json();

    container.innerHTML = '';

    if (!Array.isArray(movies) || movies.length === 0) {
      container.innerHTML = '<p class="empty">No hay contenido para mostrar.</p>';
      return;
    }

    movies.forEach(movie => {
      const card = document.createElement('div');
      card.className = 'card';

      card.innerHTML = `
        <img src="${movie.poster || 'https://via.placeholder.com/300x450?text=Sin+imagen'}"
             alt="${movie.title || 'Sin título'}"
             onerror="this.src='https://via.placeholder.com/300x450?text=Sin+imagen'">
        <div class="card-content">
          <h3>${movie.title || 'Sin título'}</h3>
          <div class="meta">
            ${movie.year || 'Sin año'} • ${Array.isArray(movie.genre) ? movie.genre.join(', ') : ''}
          </div>
          <div class="description">${movie.description || 'Sin descripción.'}</div>
          <a href="${movie.telegram_link || '#'}" target="_blank">Ver en Telegram</a>
        </div>
      `;

      container.appendChild(card);
    });

  } catch (error) {
    console.error('Error cargando contenido:', error);
    container.innerHTML = '<p class="error">Error al cargar el contenido.</p>';
  }
});
