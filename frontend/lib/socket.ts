import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const connectSocket = (session_id: string): Socket => {
    if (!socket) {
        socket = io(
            process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
        );
    }

    socket.emit('join_session', { session_id });
    return socket;
};

export const connectExaminerSocket = (): Socket => {
    if (!socket) {
        socket = io(
            process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
        );
    }

    socket.emit('join_examiner');
    return socket;
};

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};

export const getSocket = () => socket;