import { Room } from '../models/Room.js';

export const createRoom = async (req, res, next) => {
  try {
    // Drop old 'number' index if it exists - try multiple approaches
    try {
      const collection = Room.collection;
      const db = collection.db;
      
      // Get all collections and try to drop index from each
      const collections = await db.listCollections().toArray();
      for (const collInfo of collections) {
        if (collInfo.name.includes('room')) {
          try {
            const coll = db.collection(collInfo.name);
            const indexes = await coll.indexes();
            
            // Find and drop number_1 index
            for (const idx of indexes) {
              if (idx.name === 'number_1' || (idx.key && idx.key.number)) {
                try {
                  await coll.dropIndex(idx.name || { number: 1 });
                  console.log(`✅ Dropped index ${idx.name} from ${collInfo.name}`);
                } catch (dropErr) {
                  if (dropErr.code !== 27 && dropErr.code !== 85) {
                    console.log(`Could not drop index: ${dropErr.message}`);
                  }
                }
              }
            }
          } catch (collErr) {
            // Skip if can't access collection
            continue;
          }
        }
      }
    } catch (indexErr) {
      // Ignore errors during index cleanup
      console.log('Index cleanup note:', indexErr.message);
    }

    // Validate roomNumber is provided
    if (!req.body.roomNumber || req.body.roomNumber.trim() === '') {
      return res.status(400).json({ message: 'Room number is required' });
    }

    const room = await Room.create(req.body);
    res.status(201).json(room);
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key error - try to fix and retry
      if (err.message && err.message.includes('number_1')) {
        try {
          const collection = Room.collection;
          const db = collection.db;
          
          // Try to drop the problematic index
          const collections = await db.listCollections().toArray();
          for (const collInfo of collections) {
            if (collInfo.name.includes('room')) {
              try {
                const coll = db.collection(collInfo.name);
                await coll.dropIndex('number_1').catch(() => {});
                await coll.dropIndex({ number: 1 }).catch(() => {});
              } catch (e) {
                // Continue
              }
            }
          }
          
          // Retry creating the room
          const room = await Room.create(req.body);
          return res.status(201).json(room);
        } catch (retryErr) {
          return res.status(400).json({ 
            message: 'Room number must be unique. Please check if this room number already exists.' 
          });
        }
      }
      
      // Duplicate key error for roomNumber
      if (err.keyPattern && err.keyPattern.roomNumber) {
        return res.status(400).json({ message: 'Room number already exists' });
      }
      
      return res.status(400).json({ message: 'Duplicate entry. Please check your data.' });
    }
    next(err);
  }
};

export const listRooms = async (req, res, next) => {
  try {
    const { status, type, checkInDate, checkOutDate } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    
    // Exclude maintenance and cleaning rooms
    filter.status = { $nin: ['maintenance', 'cleaning'] };
    
    const rooms = await Room.find(filter).lean();
    
    // If date range provided, check availability for those dates
    if (checkInDate && checkOutDate) {
      const { Reservation } = await import('../models/Reservation.js');
      const checkIn = new Date(checkInDate);
      const checkOut = new Date(checkOutDate);
      
      for (const room of rooms) {
        const conflictingReservations = await Reservation.find({
          room: room._id,
          status: { $in: ['reserved', 'checked_in'] },
          $or: [
            {
              checkInDate: { $lte: checkOut },
              checkOutDate: { $gte: checkIn }
            }
          ]
        });
        
        room.isAvailable = conflictingReservations.length === 0;
        room.availableDates = { checkInDate, checkOutDate };
      }
    }
    
    // If no rooms found, return empty array instead of error
    if (!rooms || rooms.length === 0) {
      console.log('No rooms found in database');
      return res.json([]);
    }
    
    res.json(rooms);
  } catch (err) {
    console.error('Error listing rooms:', err);
    // Return empty array on error instead of failing
    res.json([]);
  }
};

// Get room availability calendar
export const getRoomAvailability = async (req, res, next) => {
  try {
    const { roomId, month, year } = req.query;
    if (!roomId || !month || !year) {
      res.status(400);
      throw new Error('Room ID, month, and year are required');
    }

    const { Reservation } = await import('../models/Reservation.js');
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const reservations = await Reservation.find({
      room: roomId,
      status: { $in: ['reserved', 'checked_in'] },
      $or: [
        {
          checkInDate: { $lte: endDate },
          checkOutDate: { $gte: startDate }
        }
      ]
    }).select('checkInDate checkOutDate');

    // Create availability map for each day
    const availability = {};
    const daysInMonth = endDate.getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(year, month - 1, day);
      let isAvailable = true;
      
      for (const reservation of reservations) {
        const checkIn = new Date(reservation.checkInDate);
        const checkOut = new Date(reservation.checkOutDate);
        checkIn.setHours(0, 0, 0, 0);
        checkOut.setHours(0, 0, 0, 0);
        currentDate.setHours(0, 0, 0, 0);
        
        if (currentDate >= checkIn && currentDate < checkOut) {
          isAvailable = false;
          break;
        }
      }
      
      availability[day] = isAvailable;
    }
    
    res.json({ availability, month, year });
  } catch (err) {
    next(err);
  }
};

export const updateRoom = async (req, res, next) => {
  try {
    // Drop old index if error occurs
    if (req.body.roomNumber) {
      try {
        const collection = Room.collection;
        const indexes = await collection.indexes();
        const oldIndex = indexes.find(idx => idx.name === 'number_1');
        if (oldIndex) {
          await collection.dropIndex('number_1');
          console.log('Dropped old number_1 index during update');
        }
      } catch (indexErr) {
        // Ignore
      }
    }

    const room = await Room.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!room) {
      res.status(404);
      throw new Error('Room not found');
    }
    res.json(room);
  } catch (err) {
    if (err.code === 11000) {
      if (err.keyPattern && err.keyPattern.roomNumber) {
        return res.status(400).json({ message: 'Room number already exists' });
      }
    }
    next(err);
  }
};

export const deleteRoom = async (req, res, next) => {
  try {
    const room = await Room.findByIdAndDelete(req.params.id);
    if (!room) {
      res.status(404);
      throw new Error('Room not found');
    }
    res.json({ message: 'Room deleted successfully' });
  } catch (err) {
    next(err);
  }
};



