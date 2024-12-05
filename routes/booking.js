//BACKEND: routes/booking.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const { User, Booking } = require('../models');

// Get all bookings (Protected route)
router.get('/', auth, async (req, res) => {
  try {
    console.log('Fetching bookings for provider:', req.user._id);
    
    const bookings = await Booking.find({
      $or: [
        { provider: req.user._id },
        {
          status: 'pending',
          service: { $in: req.user.services }
        }
      ]
    }).sort('-createdAt');

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ message: 'Failed to fetch bookings' });
  }
});

// Update booking status (Protected route)
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const booking = await Booking.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );
    
    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update booking status' });
  }
});

module.exports = router;