import mongoose from 'mongoose';

const { Schema } = mongoose;

const MatchSchema = new Schema({
    fixtureId: { type: Number, unique: true },
    leagueId: { type: Number, ref: 'League' },
    season: Number,
    date: Date,
    status: {
      long: String,
      short: String,
      elapsed: Number
    },
  
    homeTeam: { type: Number, ref: 'Team' },
    awayTeam: { type: Number, ref: 'Team' },
  
    goals: {
      home: { type: Number, default: 0 },
      away: { type: Number, default: 0 }
    },
    corners: {
      home: { type: Number, default: 0 },
      away: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    score: {
      halftime: { home: Number, away: Number },
      fulltime: { home: Number, away: Number },
      extratime: { home: Number, away: Number },
      penalty: { home: Number, away: Number }
    },
  
    aiPicked: { type: Boolean, default: false },
    aiPickedAt: { type: Date },
    
    playOfDay: { type: Boolean, default: false },
    playOfDayAt: { type: Date },
    
    featured: { type: Boolean, default: false },
    featuredAt: { type: Date },
    
    doubleOrNothing: { type: Boolean, default: false },
    showOnHomepage: { type: Boolean, default: false },
  
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

export default mongoose.model('Match', MatchSchema);