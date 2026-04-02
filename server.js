require('dotenv').config();

const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const path = require('path');
const supabase = require('./supabase');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const INDEXWEBOFICA_URL = process.env.INDEXWEBOFICA_URL || 'https://indexwebofica-pzwchg.fly.dev';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORT = process.env.PORT || 8080;

const ALLOWED_CHAT_ID = -1003043513364;
const ALLOWED_THREAD_ID = 38;

if (!BOT_TOKEN || !WEBAPP_URL) {
  console.error('Faltan BOT_TOKEN o WEBAPP_URL en las variables de entorno');
  process.exit(1);
}

console.log('Iniciando servidor...');
console.log('PORT:', PORT);
console.log('WEBAPP_URL:', WEBAPP_URL);
console.log('INDEXWEBOFICA_URL:', INDEXWEBOFICA_URL);
console.log('SUPABASE configurado:', !!SUPABASE_URL && !!SUPABASE_SERVICE_ROLE_KEY);

const app = express();
const bot = new Telegraf(BOT_TOKEN);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Healthcheck para Fly.io
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, status: 'running' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// =========================
// CATÁLOGO REMOTO
// =========================
app.get('/api/movies', async (req, res) => {
  try {
    const response = await fetch(`${INDEXWEBOFICA_URL}/_api/catalog`);

    if (!response.ok) {
      throw new Error(`Error ${response.status} de indexwebofica`);
    }

    const data = await response.json();

    const adapted = data.map(item => ({
      id: item.tmdb_id,
      title: item.title || 'Sin título',
      year: item.year ? parseInt(item.year) : null,
      genre: item.genres || [],
      type: item.media_type === 'movie' ? 'pelicula' : 'serie',
      poster: item.poster || 'https://via.placeholder.com/300x450?text=Sin+imagen',
      backdrop: item.backdrop || null,
      description: item.overview || 'Sin descripción disponible.',
      rating: item.rating || null,
      trailer_url: item.trailer_url || null,
      telegram_link: item.telegram_link || null,
    }));

    res.json(adapted);
  } catch (error) {
    console.error('Error obteniendo catálogo:', error.message);
    res.status(500).json({
      ok: false,
      error: 'No se pudieron cargar las películas'
    });
  }
});

// =========================
// PARSEAR LINKS DE TELEGRAM
// =========================
function parseTelegramLink(link) {
  try {
    const url = new URL(link);
    const parts = url.pathname.split('/').filter(Boolean);

    // Ejemplo:
    // https://t.me/c/3043513364/5/226?single
    if (parts[0] === 'c' && parts.length >= 4) {
      const internalId = parts[1];
      const threadId = parseInt(parts[2], 10);
      const messageId = parseInt(parts[3], 10);

      if (!internalId || !messageId) return null;

      return {
        chat_id: Number(`-100${internalId}`),
        message_thread_id: threadId,
        message_id: messageId
      };
    }

    // Ejemplo:
    // https://t.me/c/3043513364/226
    if (parts[0] === 'c' && parts.length >= 3) {
      const internalId = parts[1];
      const messageId = parseInt(parts[2], 10);

      if (!internalId || !messageId) return null;

      return {
        chat_id: Number(`-100${internalId}`),
        message_id: messageId
      };
    }

    // Ejemplo:
    // https://t.me/canal/226
    if (parts.length >= 2) {
      const username = parts[0];
      const messageId = parseInt(parts[1], 10);

      if (!username || !messageId) return null;

      return {
        chat_id: `@${username}`,
        message_id: messageId
      };
    }

    return null;
  } catch (err) {
    console.error('Error parseando telegram_link:', err.message);
    return null;
  }
}

// =========================
// COPIAR MENSAJES
// =========================
async function tryCopyMessage(toUserId, fromChatId, messageId) {
  try {
    await bot.telegram.copyMessage(
      toUserId,
      fromChatId,
      messageId,
      {
        protect_content: true
      }
    );
    return true;
  } catch (error) {
    console.error(`No se pudo copiar message_id ${messageId}:`, error.response?.description || error.message);
    return false;
  }
}

// =========================
// ENVIAR PELÍCULA
// =========================
app.post('/api/send-movie', async (req, res) => {
  try {
    const { userId, telegram_link } = req.body;

    console.log('========================');
    console.log('POST /api/send-movie');
    console.log('BODY:', req.body);
    console.log('========================');

    if (!userId || !telegram_link) {
      return res.status(400).json({
        ok: false,
        error: 'Faltan userId o telegram_link'
      });
    }

    const parsed = parseTelegramLink(telegram_link);

    if (!parsed) {
      return res.status(400).json({
        ok: false,
        error: 'No se pudo interpretar telegram_link'
      });
    }

    console.log('LINK PARSEADO:', parsed);

    // 1. Enviar primero el texto relacionado
    let sentText = false;

    sentText = await tryCopyMessage(userId, parsed.chat_id, parsed.message_id + 1);

    if (!sentText) {
      sentText = await tryCopyMessage(userId, parsed.chat_id, parsed.message_id - 1);
    }

    // 2. Luego enviar el video principal
    const sentVideo = await tryCopyMessage(userId, parsed.chat_id, parsed.message_id);

    if (!sentVideo) {
      return res.status(500).json({
        ok: false,
        error: 'No se pudo enviar el video principal'
      });
    }

    return res.json({
      ok: true,
      message: 'Película enviada correctamente',
      textSent: sentText,
      videoSent: sentVideo
    });
  } catch (error) {
    console.error('ERROR send-movie:', error.response?.description || error.message);

    return res.status(500).json({
      ok: false,
      error: 'No se pudo enviar la película',
      detail: error.response?.description || error.message
    });
  }
});

// =========================
// CONTROL DE TEMA PERMITIDO
// =========================
function isAllowedThread(ctx) {
  const chatId = ctx.chat?.id;
  const threadId = ctx.message?.message_thread_id;
  return chatId === ALLOWED_CHAT_ID && threadId === ALLOWED_THREAD_ID;
}

// =========================
// BOTÓN DE BIBLIOTECA
// =========================
async function sendBibliotecaButton() {
  await bot.telegram.sendMessage(
    ALLOWED_CHAT_ID,
    '🎬 Biblioteca oficial\n\nPulsa el botón para abrir:',
    {
      message_thread_id: ALLOWED_THREAD_ID,
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🌐 Abrir biblioteca',
            url: WEBAPP_URL
          }
        ]]
      }
    }
  );
}

// =========================
// START
// =========================
bot.start(async (ctx) => {
  await ctx.reply('Bienvenido. Abre la biblioteca y elige una película.');
});

// =========================
// MENSAJES DEL BOT
// =========================
bot.on('message', async (ctx) => {
  try {
    const chatId = ctx.chat?.id;
    const threadId = ctx.message?.message_thread_id;
    const text = ctx.message?.text || '[sin texto]';

    console.log('========================');
    console.log('CHAT ID:', chatId);
    console.log('THREAD ID:', threadId);
    console.log('TEXT:', text);
    console.log('========================');

    if (!isAllowedThread(ctx)) {
      console.log('IGNORADO: no es el tema permitido');
      return;
    }

    const normalizedText = text.trim().toLowerCase();

    if (
      normalizedText.startsWith('/start') ||
      normalizedText.startsWith('/biblioteca') ||
      normalizedText === 'biblioteca' ||
      normalizedText === 'pelis' ||
      normalizedText === 'ver'
    ) {
      await sendBibliotecaButton();
    }
  } catch (error) {
    console.error('Error en manejo de mensajes:', error.message);
  }
});

// =========================
// ARRANCAR SERVIDOR
// =========================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor en puerto ${PORT}`);
});

// =========================
// LANZAR BOT
// =========================
bot.launch()
  .then(() => console.log('Bot iniciado'))
  .catch((error) => console.error('Error iniciando el bot:', error.message));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
