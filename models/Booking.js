// BACKEND: models/booking.js
const mongoose = require('mongoose');

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
      required: true,
      validate: {
        validator: function(v) {
          return v.length === 2 && 
                 v[0] >= -180 && v[0] <= 180 && 
                 v[1] >= -90 && v[1] <= 90;
        },
        message: 'Invalid coordinates'
      }
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
  notes: String,
  amount: {
    type: Number,
    min: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for geospatial queries
bookingSchema.index({ location: '2dsphere' });

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;