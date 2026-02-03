// Main server entry point
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { initializeSocket } from './socket.js';
import notificationRoutes from './routes/notifications.js';

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'notification-system-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,  // Requirement 1: HTTP-only cookies
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
  name: 'session_id',
}));

// Initialize Socket.io
initializeSocket(httpServer);

// Routes
app.use('/api/notifications', notificationRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app, httpServer };
