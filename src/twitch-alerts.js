const { ApiClient } = require('twurple/api');
const { AppTokenAuthProvider } = require('twurple/auth');
const { EventSubWsListener } = require('twurple/eventsub-ws');
const ngrok = require('ngrok');

require('dotenv').config();

const ngrokTunnelOpen = async => {
    const url = await ngrok.connect
}

const clientId = process.env.TWITCH_CLIENT_ID;
const clientSecret = process.env.TWITCH_CLIENT_SECRET;

const authProvider = new AppTokenAuthProvider(clientId, clientSecret);
const apiClient = new ApiClient({ authProvider });

const listener = new EventSubWsListener({ apiClient });
listener.start();