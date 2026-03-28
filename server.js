const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = 'PON_AQUI_TU_TOKEN_NUEVO';
const WEBAPP_URL = 'https://botneflixtelegram.onrender.com';
const PORT = 3000;

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/movies', (req, res) => {
  try {
    const filePath = path.join(__dirname, 'data', 'movies.json');
    const rawData = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(rawData);
    res.json(data.movies || []);
  } catch (error) {
    console.error('Error leyendo movies.json:', error);
    res.status(500).json({ error: 'No se pudieron cargar las películas' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
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
