const { Server } = require('socket.io');

let io;

function initSocket(server) {
    io = new Server(server, {
        cors: { origin: 'http://localhost:3000', methods: ['GET', 'POST'] }
    });

    io.on('connection', (socket) => {
        console.log(`Student connected: ${socket.id}`);

        // Student joins their exam session room
        socket.on('join_session', ({ session_id }) => {
            socket.join(session_id);
            console.log(`Socket ${socket.id} joined session ${session_id}`);
        });

        socket.on('disconnect', () => {
            console.log(`Student disconnected: ${socket.id}`);
        });
    });

    return io;
}

// Send alert to a specific session
function sendAlert(session_id, alertData) {
    if (io) {
        io.to(session_id).emit('proctor_alert', alertData);
    }
}

module.exports = { initSocket, sendAlert };