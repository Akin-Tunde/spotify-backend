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
const stream_1 = require("stream");
require("dotenv/config");
// --- FIXED: Import PinataSDK ---
const sdk_1 = __importDefault(require("@pinata/sdk"));
const app = (0, express_1.default)();
const port = parseInt(process.env.PORT || "8888");
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
// --- FIXED: Add body parser with a high limit for the image data ---
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ limit: '10mb', extended: true }));
const generateRandomString = (length) => {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};
// --- FIXED: Corrected and more robust IPFS upload endpoint ---
app.post('/upload-to-ipfs', async (req, res) => {
    const { imageData, userName, timeRange, tracks } = req.body;
    if (!process.env.PINATA_API_KEY || !process.env.PINATA_SECRET_KEY) {
        console.error("Pinata API keys are missing from .env file");
        return res.status(500).json({ error: 'Pinata API keys not configured on server.' });
    }
    try {
        const pinata = new sdk_1.default(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_KEY);
        // 1. Upload the image buffer to IPFS
        const imageBuffer = Buffer.from(imageData, 'base64');
        const imageStream = stream_1.Readable.from(imageBuffer);
        const imageResult = await pinata.pinFileToIPFS(imageStream, {
            pinataMetadata: { name: `receipt-${userName.replace(/\s+/g, '-')}.png` },
        });
        // 2. Create detailed metadata for the NFT
        const metadata = {
            name: `Spotify Receipt for ${userName}`,
            description: `A receipt of top tracks for the period: ${timeRange}.`,
            image: `https://gateway.pinata.cloud/ipfs/${imageResult.IpfsHash}`,
            attributes: tracks.map((track, index) => ({
                trait_type: `Track #${index + 1}`,
                value: `${track.name} by ${track.artists.map((a) => a.name).join(', ')}`,
            })),
        };
        // 3. Upload the metadata JSON to IPFS
        const metadataResult = await pinata.pinJSONToIPFS(metadata, {
            pinataMetadata: { name: `metadata-${userName.replace(/\s+/g, '-')}.json` },
        });
        const tokenURI = `https://gateway.pinata.cloud/ipfs/${metadataResult.IpfsHash}`;
        // 4. Send the final metadata URL (tokenURI) back to the frontend
        res.status(200).json({ tokenURI });
    }
    catch (error) {
        console.error("Error during Pinata upload:", error);
        res.status(500).json({ error: 'Failed to upload assets to IPFS.' });
    }
});
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
// This /refresh_token route you added is great! Keeping it.
app.get('/refresh_token', async (req, res) => {
    const { refresh_token } = req.query;
    if (!refresh_token) {
        return res.status(400).json({ error: 'Refresh token is missing' });
    }
    try {
        const response = await (0, axios_1.default)({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: querystring_1.default.stringify({
                grant_type: 'refresh_token',
                refresh_token: refresh_token,
            }),
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString('base64')}`,
            },
        });
        res.json({
            access_token: response.data.access_token,
        });
    }
    catch (error) {
        res.status(400).json({ error: 'Invalid refresh token' });
    }
});
app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const state = req.query.state || null;
    const storedState = req.cookies ? req.cookies[stateKey] : null;
    console.log("--- Spotify Callback Initiated ---");
    if (state === null || state !== storedState) {
        console.error("State mismatch error.");
        console.log("Received State:", state);
        console.log("Stored State (from cookie):", storedState);
        res.redirect(`${frontend_uri}/#${querystring_1.default.stringify({ error: 'state_mismatch' })}`);
    }
    else {
        res.clearCookie(stateKey);
        try {
            console.log("Requesting tokens from Spotify with authorization code:", code);
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
            // --- NEW LOGS ---
            console.log("Successfully received tokens from Spotify.");
            console.log("Access Token:", access_token ? "Exists" : "MISSING!");
            console.log("Refresh Token:", refresh_token ? "Exists" : "MISSING!");
            const redirectUrl = `${frontend_uri}/spotify?access_token=${access_token}&refresh_token=${refresh_token}`;
            console.log("Final Redirect URL being sent to browser:", redirectUrl);
            // --- END OF NEW LOGS ---
            res.redirect(redirectUrl);
        }
        catch (error) {
            console.error("Error exchanging code for tokens:", error.response?.data || error.message);
            res.redirect(`${frontend_uri}/#${querystring_1.default.stringify({ error: 'invalid_token' })}`);
        }
    }
});
app.listen(port, "0.0.0.0", () => {
    console.log(`Backend server listening on 0.0.0.0:${port}`);
});
//# sourceMappingURL=server.js.map