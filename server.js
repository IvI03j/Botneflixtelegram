const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const PORT = process.env.PORT || 3000;

// Grupo y tema permitidos
const ALLOWED_CHAT_ID = -1003043513364;
const ALLOWED_THREAD_ID = 38;

// Username real de tu bot SIN @
const BOT_USERNAME = 'TU_USERNAME_DEL_BOT';

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
    source_chat_id: item.source_chat_id,
    source_message_id: item.source_message_id,
    source_thread_id: item.source_thread_id || null
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

app.post('/api/send-to-topic', async (req, res) => {
  try {
    const { tmdb_id } = req.body;

    if (!tmdb_id) {
      return res.status(400).json({ error: 'Falta tmdb_id' });
    }

    const items = loadItems();
    const item = items.find(i => Number(i.tmdb_id) === Number(tmdb_id));

    if (!item) {
      return res.status(404).json({ error: 'Contenido no encontrado en movies.json' });
    }

    await bot.telegram.copyMessage(
      ALLOWED_CHAT_ID,
      item.source_chat_id,
      item.source_message_id,
      {
        message_thread_id: ALLOWED_THREAD_ID
      }
    );

    return res.json({
      success: true,
      message: 'Contenido enviado al tema correctamente'
    });
  } catch (error) {
    console.error('Error en /api/send-to-topic:', error);
    return res.status(500).json({
      error: 'No se pudo enviar el contenido al tema'
    });
  }
});

const bot = new Telegraf(BOT_TOKEN);

function isAllowedTopic(ctx) {
  const chatId = ctx.chat?.id;
  const threadId = ctx.message?.message_thread_id;
  return chatId === ALLOWED_CHAT_ID && threadId === ALLOWED_THREAD_ID;
}

async function sendMiniAppButtonPrivate(ctx) {
  await ctx.reply(
    '🎬 Bienvenido a tu biblioteca.\n\nPulsa el botón para abrir la miniapp:',
    {
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🍿 Abrir biblioteca',
            web_app: { url: WEBAPP_URL }
          }
        ]]
      }
    }
  );
}

async function sendBotLinkInTopic(ctx) {
  await ctx.reply(
    '🎬 Biblioteca oficial del grupo\n\nPara abrir la miniapp, entra al bot privado desde este botón:',
    {
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🤖 Abrir bot biblioteca',
            url: `https://t.me/${BOT_USERNAME}?start=biblioteca`
          }
        ]]
      }
    }
  );
}

bot.on('message', async (ctx) => {
  try {
    const text = (ctx.message?.text || '').trim().toLowerCase();
    const chatType = ctx.chat?.type;

    // CHAT PRIVADO -> MINIAPP REAL
    if (chatType === 'private') {
      if (
        text.startsWith('/start') ||
        text.startsWith('/biblioteca')
      ) {
        await sendMiniAppButtonPrivate(ctx);
      }
      return;
    }

    // GRUPO/TEMA -> SOLO ENLACE AL BOT
    if (isAllowedTopic(ctx)) {
      if (
        text.startsWith('/biblioteca') ||
        text.startsWith('/publicar_biblioteca') ||
        text.startsWith('/start')
      ) {
        await sendBotLinkInTopic(ctx);
      }
    }
  } catch (error) {
    console.error('Error en manejo de mensajes:', error.message);
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
