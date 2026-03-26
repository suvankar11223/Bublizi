/**
 * Migration Script: Add Sequence Numbers to Existing Messages
 * 
 * This script:
 * 1. Finds all conversations
 * 2. Orders messages by createdAt
 * 3. Assigns sequential numbers
 * 4. Updates Redis sequence counters
 * 5. Validates migration
 */

import dotenv from 'dotenv';

// CRITICAL: Load environment variables BEFORE any other imports
dotenv.config();

import mongoose from 'mongoose';
import Message from '../modals/Message.js';
import Conversation from '../modals/Conversation.js';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

async function migrateSequences() {
  try {
    console.log('🔄 Starting sequence migration...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI!);
    console.log('✅ Connected to MongoDB\n');

    // Get all conversations
    const conversations = await Conversation.find({}).select('_id');
    console.log(`📊 Found ${conversations.length} conversations\n`);

    let totalMigrated = 0;
    let totalErrors = 0;

    for (const conv of conversations) {
      try {
        console.log(`Processing conversation: ${conv._id}`);

        // Get all messages in this conversation, ordered by creation time
        const messages = await Message.find({ 
          conversationId: conv._id 
        }).sort({ createdAt: 1 });

        if (messages.length === 0) {
          console.log(`  ⏭️  No messages, skipping\n`);
          continue;
        }

        console.log(`  📨 Found ${messages.length} messages`);

        // Assign sequence numbers
        for (let i = 0; i < messages.length; i++) {
          const message = messages[i];
          const seq = i + 1;

          // Only update if seq is missing or different
          if (!message.seq || message.seq !== seq) {
            await Message.updateOne(
              { _id: message._id },
              { seq }
            );
            totalMigrated++;
          }
        }

        // Update Redis sequence counter
        const maxSeq = messages.length;
        await redis.set(`seq:${conv._id}`, maxSeq.toString());

        console.log(`  ✅ Migrated ${messages.length} messages (max seq: ${maxSeq})\n`);

      } catch (err: any) {
        console.error(`  ❌ Error processing conversation ${conv._id}:`, err.message);
        totalErrors++;
      }
    }

    console.log('='.repeat(60));
    console.log('MIGRATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`✅ Total messages migrated: ${totalMigrated}`);
    console.log(`❌ Total errors: ${totalErrors}`);
    console.log('');

    // Validation
    console.log('🔍 Running validation...\n');
    const invalidMessages = await Message.countDocuments({ 
      seq: { $exists: false } 
    });

    if (invalidMessages > 0) {
      console.error(`❌ VALIDATION FAILED: ${invalidMessages} messages still missing sequence numbers`);
      process.exit(1);
    }

    console.log('✅ VALIDATION PASSED: All messages have sequence numbers\n');

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run migration
migrateSequences();
