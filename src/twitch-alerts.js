const { ApiClient } = require('twurple/api');
const { StaticAuthProvider } = require('twurple/auth');
const { EventSubListener, ReverseProxyAdapter } = require('twurple/eventsub');

require('dotenv').config();

const clientId = process.env.TWITCH_CLIENT_ID;
const clientSecret = process.env.TWITCH_CLIENT_SECRET;

const authProvider = new StaticAuthProvider(clientId, clientSecret);
const apiClient = new ApiClient({ authProvider });

const listener = new EventSubListener(apiClient, new ReverseProxyAdapter({
    hostName:
}))