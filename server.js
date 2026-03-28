const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = '8084822297:AAFTpIUQfR-LeeYXcP2c-93oqp40q0OxZTg';
const WEBAPP_URL = 'https://botneflixtelegram.onrender.com';
const TMDB_API_KEY = 'bdc77e8465d47c4f9c81e5a75b47e26f';
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !WEBAPP_URL || !TMDB_API_KEY) {
  console.error('Faltan BOT_TOKEN, WEBAPP_URL o TMDB_API_KEY en las variables de entorno');
  process.exit(1);
}

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function loadItems() {
  const filePath = path.join(__dirname, 'data', 'movies.json');
  const rawData = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(rawData).items || [];
}

async function fetchTMDBDetails(tmdbId, mediaType) {
  const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Error TMDB para ${mediaType}/${tmdbId}: ${response.status}`);
  }

  return await response.json();
}

function mapTMDBToCatalog(item, tmdbData) {
  const isMovie = item.media_type === 'movie';

  const title = isMovie ? tmdbData.title : tmdbData.name;
  const releaseDate = isMovie ? tmdbData.release_date : tmdbData.first_air_date;
  const year = releaseDate ? parseInt(releaseDate.slice(0, 4)) : null;

  return {
    id: tmdbData.id,
    title: title || 'Sin título',
    year: year,
    genre: (tmdbData.genres || []).map(g => g.name),
    type: isMovie ? 'pelicula' : 'serie',
    poster: tmdbData.poster_path
      ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`
      : 'https://via.placeholder.com/300x450?text=Sin+imagen',
    backdrop: tmdbData.backdrop_path
      ? `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}`
      : null,
    description: tmdbData.overview || 'Sin descripción disponible.',
    rating: tmdbData.vote_average || null,
    telegram_link: item.telegram_link
  };
}

app.get('/api/movies', async (req, res) => {
  try {
    const items = loadItems();

    const results = await Promise.all(
      items.map(async (item) => {
        try {
          const tmdbData = await fetchTMDBDetails(item.tmdb_id, item.media_type);
          return mapTMDBToCatalog(item, tmdbData);
        } catch (error) {
          console.error(`Error cargando item ${item.tmdb_id}:`, error.message);
          return null;
        }
      })
    );

    res.json(results.filter(Boolean));
  } catch (error) {
    console.error('Error en /api/movies:', error);
    res.status(500).json({ error: 'No se pudieron cargar las películas' });
  }
});

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply(
    '🎬 Bienvenido a tu catálogo.\nPulsa el botón para abrirlo.',
    {
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🍿 Abrir Catálogo',
            web_app: { url: WEBAPP_URL }
          }
        ]]
      }
    }
  );
});

app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);
});

bot.launch().then(() => {
  console.log('Bot iniciado');
}).catch((error) => {
  console.error('Error iniciando el bot:', error);
  process.exit(1);
});
