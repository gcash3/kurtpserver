const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const auth = require('../middleware/auth');

// Provider Registration
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, services } = req.body;

    const existingProvider = await User.findOne({ email });
    if (existingProvider) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    const provider = new User({
      name,
      email,
      phone,
      password,
      role: 'provider',
      services: services || [],
      isAvailable: false
    });

    await provider.save();

    const token = jwt.sign(
      { userId: provider._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: provider._id,
        name: provider.name,
        email: provider.email,
        phone: provider.phone,
        services: provider.services,
        isAvailable: provider.isAvailable
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Provider Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const provider = await User.findOne({ email, role: 'provider' });
    if (!provider || provider.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const token = jwt.sign(
      { userId: provider._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: provider._id,
        name: provider.name,
        email: provider.email,
        phone: provider.phone,
        services: provider.services,
        isAvailable: provider.isAvailable
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get Provider Profile
router.get('/profile', auth, async (req, res) => {
  try {
    const provider = await User.findById(req.user._id).select('-password');
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    res.json({
      success: true,
      user: provider
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update Provider Profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, email, phone, services } = req.body;

    if (email) {
      const existingUser = await User.findOne({
        email,
        _id: { $ne: req.user._id }
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
    }

    const updates = {
      ...(name && { name }),
      ...(email && { email }),
      ...(phone && { phone }),
      ...(services && { services })
    };

    const provider = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    ).select('-password');

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    res.json({
      success: true,
      user: provider
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update Password
router.put('/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    const provider = await User.findById(req.user._id);
    if (!provider || provider.password !== currentPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    provider.password = newPassword;
    await provider.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update Availability
router.post('/availability', auth, async (req, res) => {
  try {
    const { isAvailable } = req.body;
    
    const provider = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { isAvailable } },
      { new: true }
    ).select('-password');

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    req.app.get('io').emit('provider_availability_changed', {
      providerId: provider._id,
      isAvailable
    });

    res.json({
      success: true,
      user: provider
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;