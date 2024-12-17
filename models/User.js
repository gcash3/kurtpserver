//BACKEND: models/User.js
// models/User.js
const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  review: {
    type: String,
    maxLength: 500
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

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
  avatarUrl: String,
  // New rating fields
  ratings: [ratingSchema],
  averageRating: {
    type: Number,
    default: 0
  },
  totalRatings: {
    type: Number,
    default: 0
  },
  completedBookings: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Method to calculate average rating
userSchema.methods.calculateAverageRating = function() {
  if (this.ratings.length === 0) {
    this.averageRating = 0;
    this.totalRatings = 0;
  } else {
    const sum = this.ratings.reduce((acc, curr) => acc + curr.rating, 0);
    this.averageRating = parseFloat((sum / this.ratings.length).toFixed(1));
    this.totalRatings = this.ratings.length;
  }
};

// Middleware to calculate average rating before saving
userSchema.pre('save', function(next) {
  if (this.isModified('ratings')) {
    this.calculateAverageRating();
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;