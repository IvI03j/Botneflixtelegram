const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const INDEXWEBOFICA_URL = process.env.INDEXWEBOFICA_URL || 'https://indexwebofica-pzwchg.fly.dev';
const PORT = process.env.PORT || 3000;

const ALLOWED_CHAT_ID = -1003043513364;
const ALLOWED_THREAD_ID = 38;

if (!BOT_TOKEN || !WEBAPP_URL) {
  console.error('Faltan BOT_TOKEN o WEBAPP_URL en las variables de entorno');
  process.exit(1);
}

const app = express();
const bot = new Telegraf(BOT_TOKEN);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

function parseTelegramLink(link) {
  try {
    const url = new URL(link);
    const parts = url.pathname.split('/').filter(Boolean);

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

    if (parts[0] === 'c' && parts.length >= 3) {
      const internalId = parts[1];
      const messageId = parseInt(parts[2], 10);

      if (!internalId || !messageId) return null;

      return {
        chat_id: Number(`-100${internalId}`),
        message_id: messageId
      };
    }

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
    return null;
  }
}

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

    // 1. Copiar el mensaje principal (video)
    const sentMain = await tryCopyMessage(userId, parsed.chat_id, parsed.message_id);

    if (!sentMain) {
      return res.status(500).json({
        ok: false,
        error: 'No se pudo enviar el mensaje principal'
      });
    }

    // 2. Intentar copiar el mensaje siguiente (posible descripción)
    const sentNext = await tryCopyMessage(userId, parsed.chat_id, parsed.message_id + 1);

    // 3. Si no se pudo, intentar con el anterior
    let sentPrev = false;
    if (!sentNext) {
      sentPrev = await tryCopyMessage(userId, parsed.chat_id, parsed.message_id - 1);
    }

    return res.json({
      ok: true,
      message: 'Película enviada',
      extraTextSent: sentNext || sentPrev
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

function isAllowedThread(ctx) {
  const chatId = ctx.chat?.id;
  const threadId = ctx.message?.message_thread_id;
  return chatId === ALLOWED_CHAT_ID && threadId === ALLOWED_THREAD_ID;
}

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

bot.start(async (ctx) => {
  await ctx.reply('Bienvenido. Abre la biblioteca y elige una película.');
});

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

app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);
});

bot.launch()
  .then(() => console.log('Bot iniciado'))
  .catch((error) => console.error('Error iniciando el bot:', error.message));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
