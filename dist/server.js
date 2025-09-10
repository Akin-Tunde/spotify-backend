"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const querystring_1 = __importDefault(require("querystring"));
require("dotenv/config");
const app = (0, express_1.default)();
const port = 8888;
const stateKey = 'spotify_auth_state';
const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;
const frontend_uri = process.env.FRONTEND_URI;
app.use((0, cors_1.default)({
    origin: frontend_uri,
    credentials: true
}))
    .use((0, cookie_parser_1.default)());
const generateRandomString = (length) => {
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
        querystring_1.default.stringify({
            response_type: 'code',
            client_id: client_id,
            scope: scope,
            redirect_uri: redirect_uri,
            state: state
        }));
});
app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const state = req.query.state || null;
    const storedState = req.cookies ? req.cookies[stateKey] : null;
    if (state === null || state !== storedState) {
        res.redirect(`${frontend_uri}/#${querystring_1.default.stringify({ error: 'state_mismatch' })}`);
    }
    else {
        res.clearCookie(stateKey);
        try {
            const response = await (0, axios_1.default)({
                method: 'post',
                url: 'https://accounts.spotify.com/api/token',
                data: querystring_1.default.stringify({
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: redirect_uri
                }),
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString('base64')}`,
                },
            });
            const { access_token, refresh_token } = response.data;
            res.redirect(`${frontend_uri}/?access_token=${access_token}&refresh_token=${refresh_token}`);
        }
        catch (error) {
            res.redirect(`${frontend_uri}/#${querystring_1.default.stringify({ error: 'invalid_token' })}`);
        }
    }
});
app.listen(port, () => {
    console.log(`Backend server is listening at http://localhost:${port}`);
});
//# sourceMappingURL=server.js.map