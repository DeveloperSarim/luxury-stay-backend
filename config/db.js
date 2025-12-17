import mongoose from 'mongoose';

export const connectDB = async (mongoUri) => {
  try {
    await mongoose.connect(mongoUri, { autoIndex: true });
    console.log('MongoDB connected');
    
    // Drop old 'number_1' index from rooms collection if it exists
    try {
      const db = mongoose.connection.db;
      // Try both 'rooms' and 'test.rooms' collection names
      const collectionNames = ['rooms', 'test.rooms'];
      
      for (const collName of collectionNames) {
        try {
          const collection = db.collection(collName);
          const indexes = await collection.indexes();
          const oldIndex = indexes.find(idx => idx.name === 'number_1' || (idx.key && idx.key.number));
          if (oldIndex) {
            try {
              await collection.dropIndex('number_1');
              console.log(`✅ Dropped old number_1 index from ${collName} collection`);
            } catch (dropErr) {
              // Try dropping by key if name doesn't work
              if (dropErr.code === 27 || dropErr.code === 85) {
                console.log(`Index number_1 already dropped from ${collName}`);
              } else {
                try {
                  await collection.dropIndex({ number: 1 });
                  console.log(`✅ Dropped old number index from ${collName} collection`);
                } catch (keyErr) {
                  console.log(`Could not drop index from ${collName}:`, keyErr.message);
                }
              }
            }
          }
        } catch (collErr) {
          // Collection doesn't exist, skip
          continue;
        }
      }
    } catch (indexErr) {
      console.error('Warning: Could not drop old index:', indexErr.message);
    }
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};


