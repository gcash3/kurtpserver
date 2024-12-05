const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const auth = require('../middleware/auth');
const emailService = require('../utils/emailService');

// Client Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const client = await User.findOne({ 
      email, 
      role: 'client' 
    });
    
    if (!client || client.password !== password) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    const token = jwt.sign(
      { userId: client._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );

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
    res.status(500).json({ 
      success: false,
      message: 'Login failed' 
    });
  }
});

// Client Registration
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    const existingClient = await User.findOne({ email });
    if (existingClient) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    const client = new User({
      name,
      email,
      phone,
      password,
      role: 'client'
    });

    await client.save();
    await emailService.sendWelcomeEmail(client);

    const token = jwt.sign(
      { userId: client._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );

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
      message: error.message || 'Registration failed'
    });
  }
});

// Client Logout
router.post('/logout', auth, async (req, res) => {
  try {
    res.json({ 
      success: true, 
      message: 'Logged out successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Logout failed' 
    });
  }
});

// Update Client Profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    
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
      ...(phone && { phone })
    };

    const client = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    ).select('-password');

    if (!client) {
      return res.status(400).json({
        success: false,
        message: 'Client not found'
      });
    }

    res.json({
      success: true,
      user: client
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// Change Password
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    const client = await User.findById(req.user._id);
    if (!client || client.password !== currentPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    client.password = newPassword;
    await client.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update password'
    });
  }
});

module.exports = router;