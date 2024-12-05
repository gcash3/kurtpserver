//BACKEND: models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  phone: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['client', 'provider'],
    required: true
  },
  services: [{
    type: String,
    required: function() { return this.role === 'provider'; }
  }],
  isAvailable: {
    type: Boolean,
    default: false
  },
  avatarUrl: String
});
