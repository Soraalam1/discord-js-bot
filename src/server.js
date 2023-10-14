const express = require('express');
const ngrok = require('ngrok');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Hello, World!');
});

app.post('/twitch-events', express.json(), (req, res) => {
    console.log('Received event from Twitch:', req.body);
    res.status(200).send('Event received');
})

app.listen(port, async () => {
    console.log(`Server is running on port ${port}`);
    const url = await ngrok.connect(port);
    console.log(`Ngrok tunnel created at ${url}`);
})