import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  email: string;
  password: string;
  name?: string;
  avatar?: string;
  clerkId?: string;
  phoneNumber?: string;
  isPhoneVerified?: boolean;
  created?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  // Contact sync tracking
  contactsSyncedAt?: Date;
  contactsHash?: string;
  // NEW: Blocking
  blockedUsers?: mongoose.Types.ObjectId[];
  // NEW: Stories
  stories?: Array<{
    _id?: mongoose.Types.ObjectId;
    mediaUrl: string;
    mediaType: 'image' | 'video';
    caption?: string;
    viewers: mongoose.Types.ObjectId[];
    expiresAt: Date;
    createdAt: Date;
  }>;
  // NEW: Status
  status?: {
    text?: string;
    emoji?: string;
    updatedAt?: Date;
  };
  // Password Reset
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  resetPasswordUsed?: boolean;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: false, // Not required for Clerk users
      minlength: [6, "Password must be at least 6 characters"],
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    avatar: {
      type: String,
      default: "",
    },
    clerkId: {
      type: String,
    },
    phoneNumber: {
      type: String,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    created: {
      type: Date,
      default: Date.now,
    },
    // Contact sync tracking
    contactsSyncedAt: {
      type: Date,
    },
    contactsHash: {
      type: String,
    },
    // Blocking
    blockedUsers: [{
      type: Schema.Types.ObjectId,
      ref: "User",
    }],
    // Stories
    stories: [{
      mediaUrl: {
        type: String,
        required: true,
      },
      mediaType: {
        type: String,
        enum: ['image', 'video'],
        required: true,
      },
      caption: String,
      viewers: [{
        type: Schema.Types.ObjectId,
        ref: "User",
      }],
      expiresAt: {
        type: Date,
        required: true,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    }],
    // Status
    status: {
      text: {
        type: String,
        maxlength: 100,
      },
      emoji: String,
      updatedAt: Date,
    },
    // Password Reset
    resetPasswordToken: {
      type: String,
      select: false, // Don't include in queries by default
    },
    resetPasswordExpires: {
      type: Date,
      select: false,
    },
    resetPasswordUsed: {
      type: Boolean,
      default: false,
      select: false,
    },
  } as any,
  {
    timestamps: true,
  }
);

// CRITICAL INDEXES
// Auth lookup on EVERY request - most critical index
userSchema.index({ clerkId: 1 }, { unique: true, sparse: true });

// Email lookup on login - CRITICAL for performance
userSchema.index({ email: 1 }, { unique: true });

// Phone contact sync (called on every login)
userSchema.index({ phoneNumber: 1 }, { sparse: true });

// Blocked users check
userSchema.index({ blockedUsers: 1 });

// TTL index for automatic story deletion after expiry
userSchema.index({ 'stories.expiresAt': 1 }, { expireAfterSeconds: 0 });

// Hash password before saving with SECURE rounds
userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }
  const SALT_ROUNDS = 12; // 2024 minimum - default 10 is too weak
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// ============================================================================
// INDEXES FOR PERFORMANCE (FIX #11)
// ============================================================================

// Unique constraint: Email must be unique
userSchema.index({ email: 1 }, { unique: true });

// Unique constraint: Phone number must be unique (sparse for optional field)
userSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });

// Unique constraint: Clerk ID must be unique (sparse for optional field)
userSchema.index({ clerkId: 1 }, { unique: true, sparse: true });

// Query: Find users by name (for search)
userSchema.index({ name: 'text' });

// Query: Find users with stories
userSchema.index({ 'stories.expiresAt': 1 });

const User = mongoose.model<IUser>("User", userSchema);

export default User;
