//BACKEND: routes/provider.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { User, Booking } = require('../models');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: 'uploads/avatars',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Get provider profile
router.get('/profile', auth, async (req, res) => {
  try {
    const provider = await User.findById(req.user._id).select('-password');
    if (!provider || provider.role !== 'provider') {
      return res.status(404).json({ message: 'Provider not found' });
    }
    res.json(provider);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update provider availability
router.post('/availability', auth, async (req, res) => {
  try {
    const { isAvailable } = req.body;
    const provider = await User.findById(req.user._id);
    
    if (!provider || provider.role !== 'provider') {
      return res.status(404).json({ message: 'Provider not found' });
    }

    provider.isAvailable = isAvailable;
    await provider.save();

    // Emit availability change event
    req.app.get('io').emit('provider_availability_changed', {
      providerId: provider._id,
      isAvailable
    });

    res.json({ success: true, isAvailable });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update provider profile
router.put('/profile', auth, async (req, res) => {
  try {
    const updates = req.body;
    const allowedUpdates = ['name', 'email', 'phone', 'services'];
    const updateFields = {};

    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updateFields[key] = updates[key];
      }
    });

    const provider = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateFields },
      { new: true }
    ).select('-password');

    res.json(provider);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Upload provider avatar
router.post('/avatar', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const provider = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { avatarUrl } },
      { new: true }
    ).select('-password');

    res.json({ avatarUrl, provider });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update password
router.put('/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const provider = await User.findById(req.user._id);

    // In production, use proper password hashing and comparison
    if (provider.password !== currentPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    provider.password = newPassword; // In production, hash the new password
    await provider.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;