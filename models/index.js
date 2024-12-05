//BACKEND: models/index.js
const mongoose = require('mongoose');

// Define the user schema only if it hasn't been defined
let User;
try {
  User = mongoose.model('User');
} catch {
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
      required: function() { 
        return this.role === 'provider'; 
      }
    }],
    isAvailable: {
      type: Boolean,
      default: false
    },
    avatarUrl: String
  }, {
    timestamps: true
  });

  User = mongoose.model('User', userSchema);
}

// Define the booking schema only if it hasn't been defined
let Booking;
try {
  Booking = mongoose.model('Booking');
} catch {
  const bookingSchema = new mongoose.Schema({
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    service: {
      type: String,
      required: true,
      enum: ['Barber', 'Plumber', 'Electrician', 'House Cleaning', 'Carpenter', 'Painter']
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'completed', 'cancelled', 'rejected'],
      default: 'pending'
    },
    scheduledTime: {
      type: Date,
      required: true
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        required: true
      },
      address: {
        type: String,
        required: true
      }
    },
    clientInfo: {
      name: String,
      phone: String,
      email: String
    },
    notes: String
  }, {
    timestamps: true
  });

  // Add indexes
  bookingSchema.index({ location: '2dsphere' });
  bookingSchema.index({ service: 1, status: 1 });

  Booking = mongoose.model('Booking', bookingSchema);
}

module.exports = { User, Booking };