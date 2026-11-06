// Optional Node.js Server with Express & PeerJS Server
// Can also be hosted statically via Python (python -m http.server) or any static host.
const express = require('express');
const http = require('http');
const path = require('path');
const { ExpressPeerServer } = require('peer');

const app = express();
const server = http.createServer(app);

// Serve static game files
app.use(express.static(__dirname));

// Built-in PeerServer signaling backend
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/peerjs'
});

app.use('/peerjs', peerServer);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` Neighborhood Blaster 1v1 Server running on port ${PORT}`);
  console.log(` Desktop Browser / PC: http://localhost:${PORT}`);
  console.log(` Meta Quest VR:        https://<your-lan-ip>:${PORT}`);
  console.log(` Note: WebXR & Mic require HTTPS or localhost.`);
  console.log(`=======================================================`);
});
