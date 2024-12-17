// BACKEND: server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const handleSocketEvents = require('./socket/handlers');

const app = express();
const server = http.createServer(app);

// Socket.IO setup 
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection with enhanced error handling
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/service_app', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      autoIndex: true, // Build indexes
      maxPoolSize: 10, // Maintain up to 10 socket connections
    });
    
    console.log('MongoDB Connected Successfully');
    
    // Set up MongoDB indexes for ratings
    const User = require('./models/User');
    await User.collection.createIndex({ 'ratings.booking': 1 }, { unique: true });
    await User.collection.createIndex({ 'ratings.createdAt': -1 });
    await User.collection.createIndex({ averageRating: -1 });
    
    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

connectDB();

// Enhanced MongoDB connection event handlers
mongoose.connection.on('error', (error) => {
  console.error('MongoDB connection error:', error);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
  // Attempt to reconnect
  setTimeout(connectDB, 5000);
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

// Make io accessible to routes
app.set('io', io);

// Initialize Socket.IO handlers
handleSocketEvents(io);

// Static file serving
const uploadsDir = path.join(__dirname, 'uploads');
const avatarsDir = path.join(uploadsDir, 'avatars');

// Create necessary directories
[uploadsDir, avatarsDir].forEach(dir => {
  require('fs').mkdirSync(dir, { recursive: true });
});

app.use('/uploads', express.static(uploadsDir));

// API Routes
app.use('/api/client/auth', require('./routes/client-auth'));
app.use('/api/bookings', require('./routes/booking'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/provider', require('./routes/provider'));
app.use('/api/ratings', require('./routes/rating')); // New ratings route

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// API documentation endpoint
app.get('/api-docs', (req, res) => {
  res.json({
    version: '1.0',
    endpoints: {
      auth: '/api/auth',
      clientAuth: '/api/client/auth',
      bookings: '/api/bookings',
      provider: '/api/provider',
      ratings: '/api/ratings'
    }
  });
});

// Enhanced error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error('Server Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date()
  });

  // Handle specific types of errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation Error',
      errors: Object.values(err.errors).map(e => e.message)
    });
  }

  if (err.name === 'MongoServerError' && err.code === 11000) {
    return res.status(409).json({
      message: 'Duplicate entry error',
      field: Object.keys(err.keyPattern)[0]
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
};

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    message: 'Resource not found',
    path: req.path,
    method: req.method
  });
});

// Error handler
app.use(errorHandler);

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Attempt graceful shutdown
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

// Graceful shutdown handling
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
  console.log('Received shutdown signal');
  
  // Close Socket.IO connections
  io.close(() => {
    console.log('Socket.IO connections closed');
  });

  // Close MongoDB connection
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (err) {
    console.error('Error closing MongoDB connection:', err);
  }

  // Close HTTP server
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });

  // Force exit if graceful shutdown fails
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log('API Documentation available at /api-docs');
});

module.exports = app;