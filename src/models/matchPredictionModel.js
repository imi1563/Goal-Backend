import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import { createHash } from 'crypto';

const teamStatsSchema = new mongoose.Schema({
  matchesPlayed: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  draws: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  
  goalsFor: { type: Number, default: 0 },
  shotsPerGame: { type: Number, default: 0 },
  shotsOnTargetPerGame: { type: Number, default: 0 },
  possession: { type: Number, default: 0 },
  
  goalsAgainst: { type: Number, default: 0 },
  cleanSheets: { type: Number, default: 0 },
  savesPerGame: { type: Number, default: 0 },
  
  cornersPerGame: { type: Number, default: 0 },
  foulsPerGame: { type: Number, default: 0 },
  
  yellowCards: { type: Number, default: 0 },
  redCards: { type: Number, default: 0 },
  
  xG: { type: Number, default: 0 },
  xGA: { type: Number, default: 0 },
  xPTS: { type: Number, default: 0 },
  
  form: { type: String, default: '' },
  
  isHome: { type: Boolean, default: true }
});

const predictionOutcomeSchema = new mongoose.Schema({
  homeWin: { type: Number, default: 0 },
  draw: { type: Number, default: 0 },
  awayWin: { type: Number, default: 0 },
  
  homeWinBoolean: { type: Boolean, default: false },
  drawBoolean: { type: Boolean, default: false },
  awayWinBoolean: { type: Boolean, default: false },
  
  over25Boolean: { type: Boolean, default: false },
  under25Boolean: { type: Boolean, default: false },
  over05: { type: Number, default: 0 },
  over15: { type: Number, default: 0 },
  over25: { type: Number, default: 0 },
  over35: { type: Number, default: 0 },
  over45: { type: Number, default: 0 },
  over55: { type: Number, default: 0 },
  over65: { type: Number, default: 0 },
  over75: { type: Number, default: 0 },
  over85: { type: Number, default: 0 },
  over95: { type: Number, default: 0 },
  btts: { type: Number, default: 0 },
  
  doubleChance1X: { type: Number, default: 0 },
  doubleChance12: { type: Number, default: 0 },
  doubleChanceX2: { type: Number, default: 0 },
  mostLikelyScore: {
    home: { type: Number, default: 0 },
    away: { type: Number, default: 0 },
    probability: { type: Number, default: 0 }
  },
  cleanSheetHome: { type: Number, default: 0 },
  cleanSheetAway: { type: Number, default: 0 },
  under25: { type: Number, default: 0 },
  exactScore: { type: String, default: '' }
});

const matchPredictionSchema = new mongoose.Schema({
  match: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Match',
    required: true,
    unique: true
  },
  
  modelPrediction: {
    homeScore: { type: Number, min: 0 },
    awayScore: { type: Number, min: 0 },
    confidence: { type: Number, min: 0, max: 100 }
  },
  
  homeStats: teamStatsSchema,
  awayStats: teamStatsSchema,
  
  leagueAverages: {
    avgGoalsPerMatch: { type: Number, default: 0 },
    avgHomeGoals: { type: Number, default: 0 },
    avgAwayGoals: { type: Number, default: 0 },
    bttsPercentage: { type: Number, default: 0 }
  },
  
  dixonColesParams: {
    lambda1: { type: Number, default: 0 },
    lambda2: { type: Number, default: 0 },
    lambda3: { type: Number, default: 0.2 },
    rho: { type: Number, default: 0.1 },
    modelVersion: { type: String, default: '2.0.0' }
  },
  
  outcomes: predictionOutcomeSchema,
  
  simulations: [{
    homeScore: { type: Number, required: true },
    awayScore: { type: Number, required: true }
  }],
  
  status: {
    type: String,
    enum: ['pending', 'correct', 'partial'],
    default: 'pending'
  },
  isProcessed: {
    type: Boolean,
    default: false
  },
  
  manualCorners: {
    overCorners: { type: String, default: '' },
    underCorners: { type: String, default: '' },
    cornerThreshold: { type: Number, default: 0 },
    cornerPrediction: { type: String, enum: ['over', 'under', ''], default: '' }
  },

  showFlags: {
    homeWinShow: { type: Boolean, default: false },
    drawShow: { type: Boolean, default: false },
    awayWinShow: { type: Boolean, default: false },
    
    over05Show: { type: Boolean, default: false },
    over15Show: { type: Boolean, default: false },
    over25Show: { type: Boolean, default: false },
    over35Show: { type: Boolean, default: false },
    over45Show: { type: Boolean, default: false },
    over55Show: { type: Boolean, default: false },
    over65Show: { type: Boolean, default: false },
    over75Show: { type: Boolean, default: false },
    over85Show: { type: Boolean, default: false },
    over95Show: { type: Boolean, default: false },
    
    bttsShow: { type: Boolean, default: false },
    bttsYesShow: { type: Boolean, default: false },
    bttsNoShow: { type: Boolean, default: false },
    
    doubleChance1XShow: { type: Boolean, default: false },
    doubleChance12Show: { type: Boolean, default: false },
    doubleChanceX2Show: { type: Boolean, default: false },
    
    overCornersShow: { type: Boolean, default: false },
    underCornersShow: { type: Boolean, default: false },
    cornerThresholdShow: { type: Boolean, default: false },
    cornerPredictionShow: { type: Boolean, default: false }
  },
  
  inputHash: { type: String, index: true },
  computationTime: { type: Number },
  modelVersion: { type: String, default: '1.0.0' },
  confidenceThreshold: { 
    type: Number, 
    min: 0, 
    max: 100,
    default: 70 
  },
  lastUpdated: { 
    type: Date, 
    default: Date.now 
  },
  
  predictedAt: { type: Date, default: Date.now },
  
  isPlaceholder: { type: Boolean, default: false },
  placeholderReason: { type: String, enum: ['MISSING_TEAM_STATS', 'MISSING_LEAGUE_AVERAGES', 'INSUFFICIENT_TEAM_DATA', 'API_ERROR'], default: null }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

matchPredictionSchema.index({ match: 1 }, { unique: true });
matchPredictionSchema.index({ 'match': 1, 'status': 1 });
matchPredictionSchema.index({ 'predictedAt': 1 });

matchPredictionSchema.plugin(mongoosePaginate);

matchPredictionSchema.virtual('matchInfo', {
  ref: 'Match',
  localField: 'match',
  foreignField: '_id',
  justOne: true
});

matchPredictionSchema.pre('save', function(next) {
  this.lastUpdated = Date.now();
  
  if ((this.isModified('outcomes') || this.isNew) && !this._manualBooleanOverride) {
    this.setBooleanFlags();
  }
  
  this._manualBooleanOverride = false;
  
  if (this.isModified('homeStats') || this.isModified('awayStats') || this.isModified('leagueAverages')) {
    try {
      const inputString = JSON.stringify({
        homeTeam: this.homeStats?.teamId,
        awayTeam: this.awayStats?.teamId,
        league: this.leagueAverages?.leagueId,
        season: this.leagueAverages?.season,
        modelVersion: this.modelVersion
      });
      this.inputHash = createHash('md5').update(inputString).digest('hex');
    } catch (error) {
      console.error('Error generating input hash:', error);
    }
  }
  
  next();
});

matchPredictionSchema.statics.findByMatch = async function(matchId) {
  return this.findOne({ match: matchId });
};

matchPredictionSchema.methods.setBooleanFlags = function() {
  if (!this.outcomes) return;
  const home = this.outcomes.homeWin || 0;
  const draw = this.outcomes.draw || 0;
  const away = this.outcomes.awayWin || 0;
  
  const p1X = home + draw;
  const p12 = home + away;
  const pX2 = draw + away;
  
  const best = Math.max(p1X, p12, pX2);
  
  this.outcomes.homeWinBoolean = false;
  this.outcomes.drawBoolean = false;
  this.outcomes.awayWinBoolean = false;
  this.outcomes.over25Boolean = false;
  this.outcomes.under25Boolean = false;
  
  if (p1X === best) {
    this.outcomes.homeWinBoolean = true;
  } else if (pX2 === best) {
    this.outcomes.drawBoolean = true;
  } else {
    this.outcomes.awayWinBoolean = true;
  }
  
  const over25 = this.outcomes.over25 || 0;
  const under25 = this.outcomes.under25 || 0;
  
  if (over25 > 55) {
    this.outcomes.over25Boolean = true;
  }
  
  if (under25 > 25) {
    this.outcomes.under25Boolean = true;
  }
};

matchPredictionSchema.methods.isCorrect = function(actualHomeScore, actualAwayScore) {
  if (this.modelPrediction.homeScore === actualHomeScore && this.modelPrediction.awayScore === actualAwayScore) {
    return 'correct';
  }
  
  const predictionResult = this.modelPrediction.homeScore > this.modelPrediction.awayScore ? 'home' : 
                         (this.modelPrediction.homeScore < this.modelPrediction.awayScore ? 'away' : 'draw');
  const actualResult = actualHomeScore > actualAwayScore ? 'home' : 
                      (actualHomeScore < actualAwayScore ? 'away' : 'draw');
  
  return predictionResult === actualResult ? 'partial' : 'partial';
};

const MatchPrediction = mongoose.model('MatchPrediction', matchPredictionSchema);

export default MatchPrediction;