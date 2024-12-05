//BACKEND: routes/client.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { User, Booking } = require('../models');
const emailService = require('../utils/emailService');
const auth = require('../middleware/auth');

// Client Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user and validate credentials
    const client = await User.findOne({ email, role: 'client' });
    if (!client || client.password !== password) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: client._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );

    // Return success response with user data
    res.json({
      success: true,
      token,
      user: {
        id: client._id,
        name: client.name,
        email: client.email,
        phone: client.phone
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'An error occurred during login' 
    });
  }
});

// Client Registration
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Check for existing user
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Create new user
    const client = new User({
      name,
      email,
      phone,
      password,
      role: 'client'
    });

    await client.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: client._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(client);
    } catch (emailError) {
      console.error('Error sending welcome email:', emailError);
      // Continue with registration even if email fails
    }

    // Return success response
    res.status(201).json({
      success: true,
      token,
      user: {
        id: client._id,
        name: client.name,
        email: client.email,
        phone: client.phone
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false,
      message: 'An error occurred during registration'
    });
  }
});

// Create Booking
router.post('/book', auth, async (req, res) => {
  try {
    const {
      clientName,
      clientPhone,
      clientEmail,
      service,
      scheduledTime,
      location,
      notes
    } = req.body;

    // Validate required fields
    if (!clientName || !clientPhone || !clientEmail || !service || !scheduledTime || !location) {
      return res.status(400).json({
        success: false,
        message: 'Missing required booking information'
      });
    }

    // Create new booking
    const booking = new Booking({
      client: req.user._id,
      clientInfo: {
        name: clientName,
        phone: clientPhone,
        email: clientEmail
      },
      service,
      scheduledTime: new Date(scheduledTime),
      location: {
        type: 'Point',
        coordinates: location.coordinates,
        address: location.address
      },
      notes,
      status: 'pending'
    });

    await booking.save();

    // Emit socket event to service providers
    const io = req.app.get('io');
    io.to(`service_${service.toLowerCase()}`).emit('new_booking', {
      type: 'new_booking',
      booking: booking
    });

    // Return success response
    res.status(201).json({
      success: true,
      booking: booking
    });
  } catch (error) {
    console.error('Booking creation error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while creating the booking'
    });
  }
});

// Get Client's Bookings
router.get('/bookings', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const total = await Booking.countDocuments({ 
      'clientInfo.email': req.user.email 
    });

    // Get bookings with pagination
    const bookings = await Booking.find({ 
      'clientInfo.email': req.user.email 
    })
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);

    // Return paginated results
    res.json({
      success: true,
      bookings,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bookings'
    });
  }
});

// Get Single Booking
router.get('/bookings/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      'clientInfo.email': req.user.email
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching booking details'
    });
  }
});

// Cancel Booking
router.post('/bookings/:id/cancel', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      'clientInfo.email': req.user.email,
      status: 'pending'
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found or cannot be cancelled'
      });
    }

    booking.status = 'cancelled';
    await booking.save();

    // Notify provider if one was assigned
    if (booking.provider) {
      const io = req.app.get('io');
      io.to(`service_${booking.service.toLowerCase()}`).emit('booking_cancelled', {
        bookingId: booking._id.toString(),
        message: 'Booking has been cancelled by the client'
      });
    }

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      booking
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling booking'
    });
  }
});

// Update Client Profile
router.put('/profile', auth, async (req, res) => {
  try {
    const allowedUpdates = ['name', 'phone'];
    const updates = Object.keys(req.body)
      .filter(key => allowedUpdates.includes(key))
      .reduce((obj, key) => {
        obj[key] = req.body[key];
        return obj;
      }, {});

    const client = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    ).select('-password');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: client
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile'
    });
  }
});

module.exports = router;