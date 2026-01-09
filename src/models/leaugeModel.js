import mongoose from 'mongoose';

const { Schema } = mongoose;

const LeagueSchema = new Schema({
    leagueId: { type: Number, unique: true },
    name: String,
    country: String,
    season: Number,
    logo: String,
    flag: String,
    type: String,
  
    isActive: { type: Boolean, default: false },
    startDate: Date,
    endDate: Date,
  
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

export default mongoose.model('League', LeagueSchema);
  