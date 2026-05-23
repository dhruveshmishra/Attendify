const http = require("http");
const { Server } = require("socket.io");

const app = require("./app");
const socketManager = require("./utils/socketManager");

const PORT = 3000;

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: true,
        credentials: true
    }
});

const sessionMiddleware = app.get("sessionMiddleware");

if (sessionMiddleware) {
    io.engine.use(sessionMiddleware);
}

socketManager.initializeSocket(io);

server.listen(PORT, () => {
    console.log("Server running on http://localhost:" + PORT);
});