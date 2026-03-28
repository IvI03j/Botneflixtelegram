const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = '8084822297:AAFTpIUQfR-LeeYXcP2c-93oqp40q0OxZTg';
const WEBAPP_URL = 'http://localhost:3000';
const PORT = 3000;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

function loadMovies() {
    const data = fs.readFileSync(path.join(__dirname, 'data', 'movies.json'), 'utf8');
    return JSON.parse(data);
}

app.get('/api/movies', (req, res) => {
    const data = loadMovies();
    res.json(data.movies);
});

app.get('/api/genres', (req, res) => {
    const data = loadMovies();
    const genres = [...new Set(data.movies.flatMap(m => m.genre))];
    res.json(genres);
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
    console.log(`Servidor en http://localhost:${PORT}`);
});

bot.launch().then(() => {
    console.log('Bot iniciado');
});