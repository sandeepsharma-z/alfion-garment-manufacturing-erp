const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MODULES, ROLE_TEMPLATES } = require('./roles');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    uid: {
      type: String, required: [true, 'User ID is required'], unique: true,
      lowercase: true, trim: true,
      match: [/^[a-z0-9._-]{3,30}$/, 'User ID must be 3-30 chars (letters, digits, . _ -)'],
    },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.keys(ROLE_TEMPLATES), default: 'Custom' },
    modules: {
      type: [String], default: [],
      validate: {
        validator: (arr) => arr.every((m) => m === '*' || MODULES.includes(m)),
        message: 'Unknown module key in access list',
      },
    },
    flags: { type: [String], default: [] },
    status: { type: String, enum: ['Active', 'Invited', 'Disabled'], default: 'Active' },
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
    refreshTokenHashes: { type: [String], select: false, default: [] }, // one per signed-in device (max 5)
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },   // Settings → Form Fields values
  },
  { timestamps: true },
);

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, 10);

userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id, name: this.name, uid: this.uid, email: this.email, phone: this.phone,
    role: this.role, modules: this.modules, flags: this.flags, status: this.status,
    mustChangePassword: this.mustChangePassword, custom: this.custom || {},
    lastLoginAt: this.lastLoginAt, createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
