// routes/rating.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const { User, Booking } = require('../models');

// Submit a rating for a service provider
router.post('/provider/:providerId', auth, async (req, res) => {
  try {
    const { bookingId, rating, review } = req.body;
    const providerId = req.params.providerId;

    // Validate rating value
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    // Verify the booking exists and is completed
    const booking = await Booking.findOne({
      _id: bookingId,
      client: req.user._id,
      provider: providerId,
      status: 'completed'
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found or not eligible for rating'
      });
    }

    // Check if user has already rated this booking
    const provider = await User.findById(providerId);
    if (!provider || provider.role !== 'provider') {
      return res.status(404).json({
        success: false,
        message: 'Service provider not found'
      });
    }

    const existingRating = provider.ratings.find(
      r => r.booking.toString() === bookingId
    );

    if (existingRating) {
      return res.status(400).json({
        success: false,
        message: 'You have already rated this service'
      });
    }

    // Add the new rating
    provider.ratings.push({
      rating,
      review: review || '',
      booking: bookingId,
      client: req.user._id
    });

    // Increment completed bookings if not already counted
    if (!provider.completedBookings) {
      provider.completedBookings = 0;
    }
    provider.completedBookings += 1;

    await provider.save();

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    io.to(`provider_${providerId}`).emit('new_rating', {
      rating,
      review,
      bookingId,
      client: {
        id: req.user._id,
        name: req.user.name
      }
    });

    res.json({
      success: true,
      message: 'Rating submitted successfully',
      provider: {
        averageRating: provider.averageRating,
        totalRatings: provider.totalRatings
      }
    });

  } catch (error) {
    console.error('Rating submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit rating'
    });
  }
});

// Get provider ratings
router.get('/provider/:providerId', async (req, res) => {
  try {
    const provider = await User.findById(req.params.providerId)
      .select('ratings averageRating totalRatings completedBookings')
      .populate('ratings.client', 'name')
      .populate('ratings.booking', 'service scheduledTime');

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // Format ratings for response
    const formattedRatings = provider.ratings.map(rating => ({
      id: rating._id,
      rating: rating.rating,
      review: rating.review,
      clientName: rating.client.name,
      service: rating.booking.service,
      date: rating.createdAt
    }));

    res.json({
      success: true,
      data: {
        averageRating: provider.averageRating,
        totalRatings: provider.totalRatings,
        completedBookings: provider.completedBookings,
        ratings: formattedRatings
      }
    });

  } catch (error) {
    console.error('Error fetching ratings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ratings'
    });
  }
});

// Get rating statistics for a provider
router.get('/provider/:providerId/stats', async (req, res) => {
  try {
    const provider = await User.findById(req.params.providerId);
    
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // Calculate rating distribution
    const distribution = {
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0
    };

    provider.ratings.forEach(rating => {
      distribution[rating.rating]++;
    });

    res.json({
      success: true,
      data: {
        averageRating: provider.averageRating,
        totalRatings: provider.totalRatings,
        completedBookings: provider.completedBookings,
        distribution: distribution
      }
    });

  } catch (error) {
    console.error('Error fetching rating stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rating statistics'
    });
  }
});

module.exports = router;