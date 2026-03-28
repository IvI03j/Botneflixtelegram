async function loadMovies() {
  const res = await fetch('/api/movies');
  const movies = await res.json();

  const container = document.getElementById('movies');
  container.innerHTML = '';

  movies.forEach(movie => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <img src="${movie.poster}" alt="${movie.title}">
      <h3>${movie.title}</h3>
      <p>${movie.year}</p>
      <p>${movie.description}</p>
      <a href="${movie.telegram_link}" target="_blank">Ver en Telegram</a>
    `;
    container.appendChild(div);
  });
}

loadMovies();