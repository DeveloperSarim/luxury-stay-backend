import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://sarimyaseen420:TN9eWdZNeVBZyWxK@luxurystay.m1bh9b6.mongodb.net/';

async function dropOldIndex() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    
    // Get all collections
    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collections`);

    for (const collInfo of collections) {
      const collName = collInfo.name;
      
      // Check if collection name contains 'room'
      if (collName.toLowerCase().includes('room')) {
        console.log(`\n🔍 Checking collection: ${collName}`);
        
        try {
          const collection = db.collection(collName);
          const indexes = await collection.indexes();
          
          console.log(`   Found ${indexes.length} indexes:`);
          indexes.forEach(idx => {
            console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
          });

          // Find and drop number_1 index
          for (const idx of indexes) {
            if (idx.name === 'number_1' || (idx.key && idx.key.number)) {
              try {
                await collection.dropIndex(idx.name || { number: 1 });
                console.log(`   ✅ Dropped index: ${idx.name || 'number_1'}`);
              } catch (dropErr) {
                if (dropErr.code === 27) {
                  console.log(`   ℹ️  Index ${idx.name} does not exist`);
                } else if (dropErr.code === 85) {
                  console.log(`   ℹ️  Index ${idx.name} already dropped`);
                } else {
                  console.log(`   ❌ Error dropping index: ${dropErr.message}`);
                }
              }
            }
          }
        } catch (err) {
          console.log(`   ❌ Error accessing collection: ${err.message}`);
        }
      }
    }

    console.log('\n✅ Index cleanup completed!');
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

dropOldIndex();

