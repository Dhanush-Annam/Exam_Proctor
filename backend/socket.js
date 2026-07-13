const { Server } = require('socket.io');

let io;

function initSocket(server) {
    io = new Server(server, {
        cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3000', methods: ['GET', 'POST'] }
    });

    io.on('connection', (socket) => {
        console.log(`Socket connected: ${socket.id}`);

        // Student joins their exam session room
        socket.on('join_session', ({ session_id }) => {
            socket.join(session_id);
            console.log(`Socket ${socket.id} joined session ${session_id}`);
        });

        // Examiner joins the examiners room
        socket.on('join_examiner', () => {
            socket.join('examiners');
            console.log(`Socket ${socket.id} joined examiners room`);
        });

        socket.on('disconnect', () => {
            console.log(`Socket disconnected: ${socket.id}`);
        });
    });

    return io;
}

// Send alert to a specific session and examiners room
function sendAlert(session_id, alertData) {
    if (io) {
        io.to(session_id).emit('proctor_alert', alertData);
        io.to('examiners').emit('live_proctor_alert', { session_id, ...alertData });
    }
}

module.exports = { initSocket, sendAlert };