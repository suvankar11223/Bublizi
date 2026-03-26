import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './modals/userModal.js';

dotenv.config();

const dummyUserEmails = [
  'tini@test.com',
  'suvankar@test.com', 
  'bdbb@test.com',
  'krish@test.com'
];

async function removeDummyUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('✅ Connected to MongoDB');

    // Delete dummy users
    const deleteResult = await User.deleteMany({
      email: { $in: dummyUserEmails }
    });
    
    console.log(`🗑️  Removed ${deleteResult.deletedCount} dummy users`);
    
    // Show remaining users
    const remainingUsers = await User.find({}).select('name email phoneNumber');
    console.log(`\n📊 Remaining users in database: ${remainingUsers.length}`);
    
    remainingUsers.forEach(user => {
      console.log(`  - ${user.name} (${user.email}) ${user.phoneNumber || ''}`);
    });

    console.log('\n🎉 Dummy users removed successfully!');
    console.log('💡 Your app will now only show real users from phone contacts and registrations.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error removing dummy users:', error);
    process.exit(1);
  }
}

removeDummyUsers();