import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function seedAIBot() {
  await mongoose.connect(process.env.MONGO_URI!);
  console.log('Connected to MongoDB');

  // Import your actual User model
  const User = (await import('./modals/userModal.js')).default;

  // Check if bot already exists
  let bot = await (User as any).findOne({ email: 'ai@chatzi.internal' });

  if (bot) {
    console.log('✅ AI Bot already exists');
    console.log('👉 Add to .env:  AI_BOT_USER_ID=' + bot._id.toString());
  } else {
    bot = await (User as any).create({
      name: 'Chatzi AI',
      email: 'ai@chatzi.internal',
      avatar: null,
      clerkId: null,
    });
    console.log('✅ AI Bot created!');
    console.log('👉 Add to .env:  AI_BOT_USER_ID=' + bot._id.toString());
  }

  await mongoose.disconnect();
}

seedAIBot().catch(console.error);

// Run: npx ts-node --esm seed-ai-bot.ts
// Then copy the printed ID to your .env as AI_BOT_USER_ID=
