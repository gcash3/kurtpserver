const jwt = require('jsonwebtoken');
const { User, Booking } = require('../models');

const handleSocketEvents = (io) => {
  const connectedClients = new Map();

  // Middleware to authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.query.token;
      console.log(`Socket authentication attempt - Socket ID: ${socket.id}`);

      if (!token) {
        console.log('Socket connection rejected - No token provided');
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      
      // Fetch user from database
      const user = await User.findById(decoded.userId);
      if (!user) {
        console.log(`Socket connection rejected - User not found for token`);
        return next(new Error('User not found'));
      }

      // Attach user data to socket
      socket.user = user;
      console.log(`Socket authenticated - User: ${user.name} (${user.role})`);
      next();

    } catch (error) {
      console.log(`Socket authentication failed - Error: ${error.message}`);
      next(new Error('Authentication failed'));
    }
  });

  // Handle socket connections
  io.on('connection', async (socket) => {
    try {
      console.log(`New socket connection - Socket ID: ${socket.id}, User: ${socket.user.name}`);
      
      // Store client connection
      connectedClients.set(socket.id, {
        userId: socket.user._id,
        role: socket.user.role
      });

      // Join role-specific room
      socket.join(socket.user.role);
      console.log(`Socket joined ${socket.user.role} room`);

      // If provider, join service-specific rooms
      if (socket.user.role === 'provider' && socket.user.services) {
        // Join provider's personal room for private notifications
        socket.join(`provider_${socket.user._id}`);
        
        socket.user.services.forEach(service => {
          const roomName = `service_${service.toLowerCase()}`;
          socket.join(roomName);
          console.log(`Provider joined service room: ${roomName}`);
        });
      }

      // Handle new booking events
      socket.on('new_booking', async (bookingData) => {
        console.log('[Socket Handler] New booking request received:');
        console.log('Raw booking data:', bookingData);
        
        try {
          const booking = new Booking({
            client: socket.user._id,
            service: bookingData.service,
            scheduledTime: bookingData.scheduledTime,
            location: {
              type: 'Point',
              coordinates: [bookingData.longitude, bookingData.latitude],
              address: bookingData.location
            },
            clientInfo: {
              name: bookingData.clientName,
              phone: bookingData.clientPhone,
              email: bookingData.clientEmail
            },
            notes: bookingData.notes || '',
            status: 'pending'
          });

          console.log('[Socket Handler] Created booking document:', booking);
          await booking.save();
          console.log('[Socket Handler] Saved booking to database. ID:', booking._id);

          const formattedBooking = {
            id: booking._id.toString(),
            customer: {
              name: bookingData.clientName,
              phone: bookingData.clientPhone,
              email: bookingData.clientEmail
            },
            service: booking.service,
            bookingTime: booking.scheduledTime,
            location: {
              latitude: bookingData.latitude,
              longitude: bookingData.longitude,
              address: bookingData.location
            },
            status: 'pending',
            notes: bookingData.notes || ''
          };

          console.log('[Socket Handler] Emitting formatted booking:', formattedBooking);

          const serviceRoom = `service_${booking.service.toLowerCase()}`;
          io.to(serviceRoom).emit('new_booking', {
            type: 'new_booking',
            booking: formattedBooking
          });

          // Emit success event back to the client
          socket.emit('booking_created', {
            success: true,
            bookingId: booking._id.toString()
          });
          
          console.log('[Socket Handler] Booking notification sent to room:', serviceRoom);
        } catch (error) {
          console.error('[Socket Handler] Error processing booking:', error);
          socket.emit('booking_error', {
            message: 'Failed to process booking request',
            error: error.message
          });
        }
      });

      // Handle provider arrival
      socket.on('provider_arrived', async (data) => {
        const { bookingId } = data;
        
        try {
          const booking = await Booking.findById(bookingId);
          if (!booking) {
            throw new Error('Booking not found');
          }
      
          booking.status = 'arrived';
          await booking.save();
      
          // Notify client
          const clientSocket = Array.from(connectedClients.entries())
            .find(([_, client]) => client.userId.toString() === booking.client.toString())?.[0];
      
          if (clientSocket) {
            io.to(clientSocket).emit('provider_arrived', {
              bookingId: booking._id.toString(),
              provider: {
                name: socket.user.name,
                phone: socket.user.phone
              }
            });
          }
      
          socket.emit('arrival_confirmed', { bookingId: booking._id.toString() });
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      // Handle service completion
      socket.on('service_completed', async (data) => {
        try {
          const { bookingId } = data;
          const booking = await Booking.findById(bookingId);
          
          if (!booking) {
            throw new Error('Booking not found');
          }
      
          // Update booking status
          booking.status = 'completed';
          await booking.save();
      
          // Find client socket and notify them
          const clientSocket = Array.from(connectedClients.entries())
            .find(([_, client]) => client.userId.toString() === booking.client.toString())?.[0];
      
          if (clientSocket) {
            io.to(clientSocket).emit('service_completed', {
              bookingId: booking._id.toString(),
              timestamp: data.timestamp,
              providerId: booking.provider.toString(),
              message: 'Service has been completed. Please rate your experience.'
            });
          }
      
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      // Handle rating submission
      socket.on('submit_rating', async (data) => {
        try {
          const { bookingId, providerId, rating, review } = data;
          console.log('[Socket Handler] Processing rating submission:', data);

          // Validate rating
          if (!rating || rating < 1 || rating > 5) {
            throw new Error('Rating must be between 1 and 5');
          }

          // Verify booking status
          const booking = await Booking.findById(bookingId);
          if (!booking || booking.status !== 'completed') {
            throw new Error('Invalid or incomplete booking');
          }

          // Check if user is the actual client
          if (booking.client.toString() !== socket.user._id.toString()) {
            throw new Error('Unauthorized to rate this booking');
          }

          // Get provider and check for existing rating
          const provider = await User.findById(providerId);
          if (!provider || provider.role !== 'provider') {
            throw new Error('Provider not found');
          }

          // Check for duplicate rating
          if (provider.ratings.some(r => r.booking.toString() === bookingId)) {
            throw new Error('You have already rated this service');
          }

          // Add new rating
          provider.ratings.push({
            rating,
            review: review || '',
            booking: bookingId,
            client: socket.user._id
          });

          // Calculate new average rating
          provider.calculateAverageRating();
          await provider.save();

          console.log('[Socket Handler] Rating saved successfully');

          // Notify provider of new rating
          io.to(`provider_${providerId}`).emit('new_rating', {
            bookingId,
            rating,
            review,
            clientName: socket.user.name,
            averageRating: provider.averageRating,
            totalRatings: provider.totalRatings
          });

          // Confirm rating submission to client
          socket.emit('rating_submitted', {
            success: true,
            bookingId,
            providerId,
            averageRating: provider.averageRating
          });

        } catch (error) {
          console.error('[Socket Handler] Rating submission error:', error);
          socket.emit('rating_error', {
            message: error.message
          });
        }
      });

      // Handle booking acceptance
      socket.on('accept_booking', async (data) => {
        console.log(`Booking acceptance request - Booking ID: ${data.bookingId}`);
        
        try {
          const booking = await Booking.findById(data.bookingId);
          if (!booking || booking.status !== 'pending') {
            throw new Error('Booking not available');
          }

          // Update booking status and assign provider
          booking.status = 'accepted';
          booking.provider = socket.user._id;
          await booking.save();

          // Find the client's socket if they're connected
          const clientSocket = Array.from(connectedClients.entries())
            .find(([_, client]) => client.userId.toString() === booking.client.toString())?.[0];

          // Send detailed notification to client
          if (clientSocket) {
            io.to(clientSocket).emit('booking_accepted', {
              bookingId: booking._id.toString(),
              provider: {
                id: socket.user._id.toString(),
                name: socket.user.name,
                phone: socket.user.phone,
                services: socket.user.services,
                averageRating: socket.user.averageRating,
                totalRatings: socket.user.totalRatings
              },
              message: `Provider ${socket.user.name} accepted your booking`
            });
          }

          // Send confirmation to the accepting provider
          socket.emit('booking_accepted_success', {
            bookingId: booking._id.toString(),
            booking: {
              id: booking._id.toString(),
              customer: booking.clientInfo,
              service: booking.service,
              bookingTime: booking.scheduledTime,
              location: {
                latitude: booking.location.coordinates[1],
                longitude: booking.location.coordinates[0],
                address: booking.location.address
              },
              status: booking.status,
              notes: booking.notes
            }
          });

          // Notify other providers that the booking is no longer available
          const serviceRoom = `service_${booking.service.toLowerCase()}`;
          socket.to(serviceRoom).emit('booking_taken', {
            bookingId: booking._id.toString()
          });

          console.log(`Booking ${booking._id} accepted by provider ${socket.user.name}`);

        } catch (error) {
          console.error('Error accepting booking:', error);
          socket.emit('booking_error', {
            message: error.message
          });
        }
      });

      // Handle provider availability updates
      socket.on('update_availability', async (data) => {
        try {
          const { isAvailable } = data;
          socket.user.isAvailable = isAvailable;
          await socket.user.save();

          socket.emit('availability_updated', { isAvailable });
          console.log(`Provider ${socket.user.name} availability updated to: ${isAvailable}`);
        } catch (error) {
          console.error('Error updating availability:', error);
          socket.emit('update_error', {
            message: 'Failed to update availability'
          });
        }
      });

      // Handle booking status updates
      socket.on('update_booking_status', async (data) => {
        try {
          const { bookingId, status } = data;
          const booking = await Booking.findById(bookingId);
          
          if (!booking) {
            throw new Error('Booking not found');
          }

          booking.status = status;
          await booking.save();

          const clientSocket = Array.from(connectedClients.entries())
            .find(([_, client]) => client.userId.toString() === booking.client.toString())?.[0];

          if (clientSocket) {
            io.to(clientSocket).emit('booking_status_updated', {
              bookingId: booking._id.toString(),
              status
            });
          }

          socket.emit('status_update_success', {
            bookingId: booking._id.toString(),
            status
          });

          console.log(`Booking ${bookingId} status updated to: ${status}`);
        } catch (error) {
          console.error('Error updating booking status:', error);
          socket.emit('update_error', {
            message: 'Failed to update booking status'
          });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`Socket disconnected - Socket ID: ${socket.id}`);
        connectedClients.delete(socket.id);
      });

    } catch (error) {
      console.error('Error in socket connection handler:', error);
      socket.disconnect(true);
    }
  });

  // Return utility functions for socket management
  return {
    getConnectedClients: () => connectedClients,
    emitToUser: (userId, event, data) => {
      const socketId = Array.from(connectedClients.entries())
        .find(([_, client]) => client.userId.toString() === userId.toString())?.[0];
      
      if (socketId) {
        io.to(socketId).emit(event, data);
        return true;
      }
      return false;
    },
    emitToRoom: (room, event, data) => {
      io.to(room).emit(event, data);
    },
    getOnlineProviders: () => {
      return Array.from(connectedClients.entries())
        .filter(([_, client]) => client.role === 'provider')
        .map(([socketId, _]) => socketId);
    }
  };
};

module.exports = handleSocketEvents;