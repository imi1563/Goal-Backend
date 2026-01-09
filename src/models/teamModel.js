import mongoose from 'mongoose';

const { Schema } = mongoose;

const TeamSchema = new Schema({
    teamId: { type: Number, unique: true },
    name: String,
    code: String,
    country: String,
    founded: Number,
    logo: String,
    venue: {
      id: Number,
      name: String,
      city: String,
      capacity: Number,
      surface: String,
      image: String
    },
    statistics: {
      type: Map,
      of: {
        type: Map,
        of: {
          matchesPlayed: { type: Number, default: 0 },
          wins: { type: Number, default: 0 },
          draws: { type: Number, default: 0 },
          losses: { type: Number, default: 0 },
          
          goalsFor: { type: Number, default: 0 },
          goalsAgainst: { type: Number, default: 0 },
          goalsForAvg: { type: Number, default: 0 },
          goalsAgainstAvg: { type: Number, default: 0 },
          
          xG: { type: Number, default: 0 },
          xGA: { type: Number, default: 0 },
          
          form: { type: String, default: '' },
          winPercentage: { type: Number, default: 0 },
          drawPercentage: { type: Number, default: 0 },
          lossPercentage: { type: Number, default: 0 },
          goalDifference: { type: Number, default: 0 },
          
          mostUsedFormation: { type: String, default: '4-4-2' },
          yellowCards: { type: Number, default: 0 },
          redCards: { type: Number, default: 0 },
          
          lastUpdated: { type: Date, default: Date.now }
        }
      }
    },
    createdAt: { type: Date, default: Date.now }
  });

export default mongoose.model('Team', TeamSchema);
  