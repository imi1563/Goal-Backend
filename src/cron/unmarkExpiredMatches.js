import cron from 'node-cron';
import Match from '../models/matchModel.js';
import { createCronJob, withRetry, withTimeout } from '../utils/cronWrapper.js';
import { startCronTracking } from '../utils/cronTracker.js';

/**
 * Helper function to get UK time boundaries for filtering matches
 * Returns matches that are older than 12 hours after midnight UK time (should be unmarked)
 * 
 * Since matches are stored in UTC in the database, we need to:
 * 1. Calculate what UTC time corresponds to UK midnight
 * 2. Compare match.date (UTC) with UK midnight + 12 hours (also in UTC)
 */
const getUKTimeBoundaries = () => {
  const now = new Date();
  
  // Get current UK time components using Intl.DateTimeFormat
  const ukFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const ukParts = ukFormatter.formatToParts(now);
  
  // Edge case handling: Ensure all required parts exist
  const yearPart = ukParts.find(p => p.type === 'year');
  const monthPart = ukParts.find(p => p.type === 'month');
  const dayPart = ukParts.find(p => p.type === 'day');
  
  if (!yearPart || !monthPart || !dayPart) {
    console.error('⚠️ Failed to parse UK time components, falling back to UTC');
    // Fallback: Use UTC midnight + 12 hours (assumes GMT)
    const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const maxDate = new Date(utcMidnight.getTime() + 12 * 60 * 60 * 1000);
    return { maxDate };
  }
  
  const ukYear = parseInt(yearPart.value);
  const ukMonth = parseInt(monthPart.value) - 1; // 0-indexed
  const ukDay = parseInt(dayPart.value);
  
  // Validate parsed values
  if (isNaN(ukYear) || isNaN(ukMonth) || isNaN(ukDay)) {
    console.error('⚠️ Invalid UK time values, falling back to UTC');
    const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const maxDate = new Date(utcMidnight.getTime() + 12 * 60 * 60 * 1000);
    return { maxDate };
  }
  
  // Calculate UK midnight in UTC by finding the offset
  // Method: Create a test date at noon UTC and see what time it is in UK
  // This tells us the offset (GMT = 0, BST = +1)
  const testNoonUTC = new Date(Date.UTC(ukYear, ukMonth, ukDay, 12, 0, 0));
  const ukTimeAtNoon = testNoonUTC.toLocaleString('en-US', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    hour12: false
  });
  
  // Edge case: Handle unexpected time format
  const timeParts = ukTimeAtNoon.split(':');
  if (!timeParts || timeParts.length === 0) {
    console.error('⚠️ Failed to parse UK time at noon, assuming GMT (offset 0)');
    const ukMidnightUTC = new Date(Date.UTC(ukYear, ukMonth, ukDay, 0, 0, 0, 0));
    const maxDate = new Date(ukMidnightUTC.getTime() + 12 * 60 * 60 * 1000);
    return { maxDate };
  }
  
  const ukHourAtNoon = parseInt(timeParts[0]);
  
  // Edge case: Validate hour value
  if (isNaN(ukHourAtNoon) || ukHourAtNoon < 0 || ukHourAtNoon > 23) {
    console.error('⚠️ Invalid UK hour value, assuming GMT (offset 0)');
    const ukMidnightUTC = new Date(Date.UTC(ukYear, ukMonth, ukDay, 0, 0, 0, 0));
    const maxDate = new Date(ukMidnightUTC.getTime() + 12 * 60 * 60 * 1000);
    return { maxDate };
  }
  
  const offsetHours = ukHourAtNoon - 12; // +1 for BST, 0 for GMT
  
  // Edge case: Validate offset (should be 0 or 1, but handle edge cases)
  // UK offset can be 0 (GMT) or +1 (BST), but handle unexpected values
  const validOffset = (offsetHours === 0 || offsetHours === 1) ? offsetHours : 0;
  
  // UK midnight in UTC = UTC midnight minus the offset
  // If BST (offset = +1), UK midnight = 23:00 UTC previous day
  // If GMT (offset = 0), UK midnight = 00:00 UTC same day
  const ukMidnightUTC = new Date(Date.UTC(ukYear, ukMonth, ukDay, -validOffset, 0, 0, 0));
  
  // Validate the calculated date
  if (isNaN(ukMidnightUTC.getTime())) {
    console.error('⚠️ Invalid UK midnight calculation, falling back to UTC');
    const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const maxDate = new Date(utcMidnight.getTime() + 12 * 60 * 60 * 1000);
    return { maxDate };
  }
  
  // Matches older than 12 hours after midnight UK should be unmarked
  const maxDate = new Date(ukMidnightUTC.getTime() + 12 * 60 * 60 * 1000);
  
  // Final validation
  if (isNaN(maxDate.getTime())) {
    console.error('⚠️ Invalid maxDate calculation, using fallback');
    const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    return { maxDate: new Date(utcMidnight.getTime() + 12 * 60 * 60 * 1000) };
  }
  
  return {
    maxDate // Matches with date < this should be unmarked (both in UTC)
  };
};

export const unmarkExpiredMatches = async () => {
  const tracker = await startCronTracking('Unmark Expired Matches');
  
  try {
    console.log(`🔄 Starting unmark expired matches job... [Tracked: ${tracker.executionId}]`);
    
    // Get UK time boundaries - matches older than 12 hours after midnight UK should be unmarked
    const { maxDate } = getUKTimeBoundaries();
    const now = new Date();
    
    // Calculate 6 hours ago in UTC (for comparing with match.date which is stored in UTC)
    // This checks if match scheduled time has passed by 6+ hours
    const sixHoursAgoUTC = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    
    // 24 hours after UK midnight (fallback for very old never-started matches)
    const veryOldDate = new Date(maxDate.getTime() + 12 * 60 * 60 * 1000);
    
    console.log(`📅 Unmarking matches older than ${maxDate.toISOString()} (12 hours after midnight UK)`);
    console.log(`🕒 Current UTC time: ${now.toISOString()}`);
    console.log(`⏰ 6 hours ago (UTC): ${sixHoursAgoUTC.toISOString()} (for comparing with match.date in UTC)`);
    console.log(`📆 Very old cutoff (24h after UK midnight): ${veryOldDate.toISOString()}`);
    console.log(`💡 Note: Match dates are stored in UTC, comparisons are done in UTC`);
    
    // LIVE statuses that should NEVER be unmarked while match is live
    const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'PST'];
    const NOT_STARTED_STATUSES = ['NS', 'TBD', 'PST'];
    const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'CANC', 'ABD', 'AWD', 'WO'];
    
    // Find matches that are marked but expired
    // Note: showOnHomepage is NOT unmarked by this cron (client requirement)
    // Handles: Trending (featured), Play of Day, AI Picked Winners, Double or Nothing
    // 
    // TIME HANDLING:
    // - Match dates (match.date) are stored in UTC in database
    // - maxDate: UK midnight + 12h (converted to UTC) - for 12h rule
    // - sixHoursAgoUTC: Current UTC - 6h (for comparing with match.date UTC)
    // - veryOldDate: UK midnight + 24h (converted to UTC) - fallback
    // - All comparisons are UTC to UTC (correct!)
    //
    // Rules:
    // 1. NEVER unmark LIVE matches (protected)
    // 2. Unmark finished matches after 12h cutoff (UK midnight + 12h)
    // 3. Unmark never-started matches if 6h+ past scheduled (UTC) OR 24h old (UK midnight)
    // 4. Protect matches about to start (< 6h past scheduled UTC)
    const expiredMarkedMatches = await Match.find({
      $and: [
        // Must have at least one of these flags set
        {
          $or: [
            { aiPicked: true },           // AI Picked Winners
            { playOfDay: true },           // Play of the Day
            { featured: true },            // Trending (featured = trending in API)
            { doubleOrNothing: true }      // Double or Nothing
          ]
        },
        // Exclude LIVE matches - never unmark while match is live
        { 'status.short': { $nin: LIVE_STATUSES } },
        // Must meet expiration criteria
        {
          $or: [
            // Case 1: Finished matches after 12h cutoff
            {
              date: { $lt: maxDate },
              'status.short': { $in: FINISHED_STATUSES } // Finished matches only
            },
            // Case 2: Never-started matches - 6h past scheduled (UTC) OR 24h old (UK midnight)
            // IMPORTANT: Only unmark if scheduled time has PASSED (date < now), not future matches
            {
              $and: [
                { 'status.short': { $in: NOT_STARTED_STATUSES } },
                { date: { $lt: now } }, // Scheduled time must have PASSED (not future)
                {
                  $or: [
                    { date: { $lt: sixHoursAgoUTC } }, // 6+ hours past scheduled time (match.date is UTC)
                    { date: { $lt: veryOldDate } }     // 24h after UK midnight (fallback)
                  ]
                }
              ]
            }
          ]
        }
      ]
    }).select('_id fixtureId date aiPicked playOfDay featured doubleOrNothing status');
    
    if (expiredMarkedMatches.length === 0) {
      console.log('✅ No expired marked matches found. All matches are current!');
      await tracker.success({ message: 'No expired matches to unmark', unmarked: 0 });
      return { unmarked: 0 };
    }
    
    console.log(`📊 Found ${expiredMarkedMatches.length} expired marked matches to unmark`);
    
    // Count by type
    const counts = {
      aiPicked: 0,
      playOfDay: 0,
      featured: 0,
      doubleOrNothing: 0
    };
    
    expiredMarkedMatches.forEach(match => {
      if (match.aiPicked) counts.aiPicked++;
      if (match.playOfDay) counts.playOfDay++;
      if (match.featured) counts.featured++;
      if (match.doubleOrNothing) counts.doubleOrNothing++;
    });
    
    console.log('📋 Breakdown by type:');
    console.log(`  - AI Picked: ${counts.aiPicked}`);
    console.log(`  - Play of Day: ${counts.playOfDay}`);
    console.log(`  - Featured: ${counts.featured}`);
    console.log(`  - Double or Nothing: ${counts.doubleOrNothing}`);
    
    // Show sample matches
    const sampleMatches = expiredMarkedMatches.slice(0, 5);
    console.log('\n📋 Sample expired matches:');
    sampleMatches.forEach((match, index) => {
      const flags = [];
      if (match.aiPicked) flags.push('AI Picked');
      if (match.playOfDay) flags.push('Play of Day');
      if (match.featured) flags.push('Featured');
      if (match.doubleOrNothing) flags.push('Double or Nothing');
      
      const matchDate = new Date(match.date).toISOString();
      const status = match.status?.short || 'N/A';
      console.log(`  ${index + 1}. Match ${match.fixtureId} - ${matchDate} [${flags.join(', ')}] Status: ${status}`);
    });
    
    if (expiredMarkedMatches.length > 5) {
      console.log(`  ... and ${expiredMarkedMatches.length - 5} more matches`);
    }
    
    // Unmark all expired matches
    const matchIds = expiredMarkedMatches.map(m => m._id);
    
    // Edge case: Handle empty matchIds array
    if (matchIds.length === 0) {
      console.log('⚠️ No match IDs to update');
      await tracker.success({ message: 'No matches to update', unmarked: 0 });
      return { unmarked: 0 };
    }
    
    const updateResult = await Match.updateMany(
      { _id: { $in: matchIds } },
      {
        $set: {
          aiPicked: false,
          playOfDay: false,
          featured: false,
          doubleOrNothing: false,
          updatedAt: new Date()
        },
        $unset: {
          aiPickedAt: 1,
          playOfDayAt: 1,
          featuredAt: 1
        }
      }
    );
    
    console.log('\n🎉 Unmark expired matches completed!');
    console.log(`📊 Summary:`);
    console.log(`  - Matches processed: ${expiredMarkedMatches.length}`);
    console.log(`  - Matches updated: ${updateResult.modifiedCount}`);
    console.log(`  - AI Picked unmarked: ${counts.aiPicked}`);
    console.log(`  - Play of Day unmarked: ${counts.playOfDay}`);
    console.log(`  - Featured unmarked: ${counts.featured}`);
    console.log(`  - Double or Nothing unmarked: ${counts.doubleOrNothing}`);
    
    await tracker.success({ 
      unmarked: updateResult.modifiedCount,
      counts,
      matchesProcessed: expiredMarkedMatches.length
    });
    
    return {
      unmarked: updateResult.modifiedCount,
      counts,
      matchesProcessed: expiredMarkedMatches.length
    };
    
  } catch (error) {
    await tracker.fail(error);
    console.error('💥 Error in unmark expired matches:', error.message);
    throw error;
  }
};

export const startUnmarkExpiredMatchesJob = () => {
  const wrappedJob = createCronJob(
    'Unmark Expired Matches',
    withTimeout(withRetry(unmarkExpiredMatches, 2, 10000), 300000), // 5 min timeout
    {
      sendSuccessNotification: false,
      context: { jobType: 'cleanup', frequency: 'daily' }
    }
  );


  cron.schedule('0 */6 * * *', wrappedJob, {
    timezone: 'UTC'
  });
  
  console.log('⏰ Unmark expired matches scheduled: every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)');
  console.log('📅 Unmarks matches older than 12 hours after midnight UK time');
  console.log('🛡️ Protects: LIVE matches, matches about to start (< 6h past scheduled)');
  console.log('🧹 Cleans up: Finished matches (12h rule), never-started matches (6h+ past scheduled OR 24h old)');
  console.log('💡 Running frequently ensures expired matches are removed quickly (max 6h delay)');
};

export const triggerUnmarkExpiredMatches = async () => {
  try {
    console.log('🔧 Manual trigger: Starting unmark expired matches...');
    return await unmarkExpiredMatches();
  } catch (error) {
    console.error('💥 Manual unmark expired matches failed:', error.message);
    throw error;
  }
};

