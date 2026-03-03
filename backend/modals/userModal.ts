import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  email: string;
  password: string;
  name?: string;
  avatar?: string;
  clerkId?: string;
  created?: Date;
  createdAt?: Date;
  updatedAt?: Date;
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
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
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
      unique: true,
      sparse: true, // Allows null values while maintaining uniqueness
    },
    created: {
      type: Date,
      default: Date.now,
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
        index: true, // TTL index for auto-deletion
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
  } as any,
  {
    timestamps: true,
  }
);

// TTL index for automatic story deletion after expiry
userSchema.index({ 'stories.expiresAt': 1 }, { expireAfterSeconds: 0 });

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
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

const User = mongoose.model<IUser>("User", userSchema);

export default User;
