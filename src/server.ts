import express from 'express';
import axios from 'axios';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import querystring from 'querystring';
import 'dotenv/config';

const app = express();
const port = 8888;
const stateKey = 'spotify_auth_state';

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;
const frontend_uri = process.env.FRONTEND_URI;

app.use(cors({
    origin: frontend_uri,
    credentials: true
}))
.use(cookieParser());

const generateRandomString = (length: number): string => {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

app.get('/login', (req, res) => {
    const state = generateRandomString(16);
    res.cookie(stateKey, state);
    const scope = 'user-top-read';
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: client_id,
            scope: scope,
            redirect_uri: redirect_uri,
            state: state
        }));
});

// Add this new route to your src/server.ts file

app.get('/refresh_token', async (req, res) => {
    const { refresh_token } = req.query;

    if (!refresh_token) {
        return res.status(400).json({ error: 'Refresh token is missing' });
    }

    try {
        const response = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: querystring.stringify({
                grant_type: 'refresh_token',
                refresh_token: refresh_token as string,
            }),
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString('base64')}`,
            },
        });

        res.json({
            access_token: response.data.access_token,
        });

    } catch (error) {
        res.status(400).json({ error: 'Invalid refresh token' });
    }
});

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const state = req.query.state || null;
    const storedState = req.cookies ? req.cookies[stateKey] : null;

    if (state === null || state !== storedState) {
        res.redirect(`${frontend_uri}/#${querystring.stringify({ error: 'state_mismatch' })}`);
    } else {
        res.clearCookie(stateKey);
        try {
            const response = await axios({
                method: 'post',
                url: 'https://accounts.spotify.com/api/token',
                data: querystring.stringify({
                    grant_type: 'authorization_code',
                    code: code as string,
                    redirect_uri: redirect_uri
                }),
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString('base64')}`,
                },
            });

            const { access_token, refresh_token } = response.data;
            res.redirect(`${frontend_uri}/?access_token=${access_token}&refresh_token=${refresh_token}`);

        } catch (error) {
            res.redirect(`${frontend_uri}/#${querystring.stringify({ error: 'invalid_token' })}`);
        }
    }
});

app.listen(port, () => {
    console.log(`Backend server is listening at http://localhost:${port}`);
});
