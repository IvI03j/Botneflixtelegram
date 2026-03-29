const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
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
  const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES&append_to_response=videos`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Error TMDB para ${mediaType}/${tmdbId}: ${response.status}`);
  }

  return await response.json();
}

function getTrailerUrl(tmdbData) {
  const videos = tmdbData.videos?.results || [];

  const trailer = videos.find(video =>
    video.site === 'YouTube' &&
    video.type === 'Trailer'
  );

  if (!trailer) return null;

  return `https://www.youtube.com/watch?v=${trailer.key}`;
}

function mapTMDBToCatalog(item, tmdbData) {
  const isMovie = item.media_type === 'movie';
  const title = isMovie ? tmdbData.title : tmdbData.name;
  const releaseDate = isMovie ? tmdbData.release_date : tmdbData.first_air_date;
  const year = releaseDate ? parseInt(releaseDate.slice(0, 4)) : null;

  return {
    id: tmdbData.id,
    title: title || 'Sin título',
    year,
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
    trailer_url: getTrailerUrl(tmdbData),
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

app.get('/api/search-tmdb', async (req, res) => {
  try {
    const query = req.query.query;
    const mediaType = req.query.media_type || 'movie';

    if (!query) {
      return res.status(400).json({ error: 'Falta el parámetro query' });
    }

    if (!['movie', 'tv'].includes(mediaType)) {
      return res.status(400).json({ error: 'media_type debe ser movie o tv' });
    }

    const url = `https://api.themoviedb.org/3/search/${mediaType}?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(query)}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Error buscando en TMDB: ${response.status}`);
    }

    const data = await response.json();

    const results = (data.results || []).slice(0, 10).map(item => {
      const title = mediaType === 'movie' ? item.title : item.name;
      const releaseDate = mediaType === 'movie' ? item.release_date : item.first_air_date;
      const year = releaseDate ? parseInt(releaseDate.slice(0, 4)) : null;

      return {
        id: item.id,
        title: title || 'Sin título',
        year,
        poster: item.poster_path
          ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
          : 'https://via.placeholder.com/300x450?text=Sin+imagen',
        overview: item.overview || 'Sin descripción.',
        type: mediaType
      };
    });

    res.json(results);
  } catch (error) {
    console.error('Error en /api/search-tmdb:', error);
    res.status(500).json({ error: 'Error buscando en TMDB' });
  }
});

const bot = new Telegraf(BOT_TOKEN);

// COMANDO START TEMPORAL SIN BOTÓN
bot.start((ctx) => {
  ctx.reply('🤖 Bot en modo detección.\nEscribe en el tema que quieras usar y revisaré el chat_id y el thread_id.');
});

// DETECTOR TEMPORAL
bot.on('message', async (ctx) => {
  try {
    const chatId = ctx.chat?.id;
    const threadId = ctx.message?.message_thread_id || 'sin tema';
    const chatType = ctx.chat?.type || 'desconocido';
    const chatTitle = ctx.chat?.title || ctx.chat?.username || 'sin título';
    const text = ctx.message?.text || '[no es texto]';

    console.log('==============================');
    console.log('MENSAJE RECIBIDO');
    console.log('CHAT ID:', chatId);
    console.log('THREAD ID:', threadId);
    console.log('CHAT TYPE:', chatType);
    console.log('CHAT TITLE:', chatTitle);
    console.log('TEXT:', text);
    console.log('==============================');

    await ctx.reply(
      `📌 Datos detectados:\n\n` +
      `Chat ID: ${chatId}\n` +
      `Thread ID: ${threadId}\n` +
      `Tipo de chat: ${chatType}\n` +
      `Título: ${chatTitle}`
    );
  } catch (error) {
    console.error('Error en detector de IDs:', error.message);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);
});

bot.launch()
  .then(() => {
    console.log('Bot iniciado');
  })
  .catch((error) => {
    console.error('Error iniciando el bot:', error.message);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
