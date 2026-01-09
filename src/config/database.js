import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ silent: true });

const connectDB = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log('✅ Using existing database connection');
      return mongoose.connection;
    }
    
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn.connection;
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    throw error;
  }
};

export default connectDB;
