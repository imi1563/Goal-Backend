import Team from '../models/teamModel.js';
import { sendSuccess, sendError, sendPaginatedResponse } from '../utils/response.js';
import catchAsyncError from '../utils/catchAsync.js';

export const getAllTeams = catchAsyncError(async (req, res) => {
  const { page = 1, limit = 10, search = '', country = '' } = req.query;
  
  const filter = {};
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } }
    ];
  }
  if (country) {
    filter.country = { $regex: country, $options: 'i' };
  }
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [teams, total] = await Promise.all([
    Team.find(filter).sort({ name: 1 }).skip(skip).limit(parseInt(limit)),
    Team.countDocuments(filter)
  ]);
  
  const totalPages = Math.ceil(total / parseInt(limit));
  
  return sendPaginatedResponse(
    res,
    parseInt(page),
    totalPages,
    total,
    teams
  );
});

export const getTeamById = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  
  const team = await Team.findById(id);
  if (!team) {
    return sendError(res, { statusCode: 404, message: 'Team not found' });
  }
  
  return sendSuccess(res, { data: team });
});

export const createTeam = catchAsyncError(async (req, res) => {
  const { teamId, name, code, country, founded, logo, venue } = req.body;
  
  const existingTeam = await Team.findOne({ teamId });
  if (existingTeam) {
    return sendError(res, { 
      statusCode: 400, 
      message: 'Team with this ID already exists' 
    });
  }
  
  const newTeam = new Team({
    teamId,
    name,
    code,
    country,
    founded,
    logo,
    venue
  });
  
  await newTeam.save();
  
  return sendSuccess(res, { 
    statusCode: 201, 
    data: newTeam,
    message: 'Team created successfully' 
  });
});

export const updateTeam = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  
  const updatedTeam = await Team.findByIdAndUpdate(id, updateData, { 
    new: true, 
    runValidators: true 
  });
  
  if (!updatedTeam) {
    return sendError(res, { statusCode: 404, message: 'Team not found' });
  }
  
  return sendSuccess(res, { 
    data: updatedTeam,
    message: 'Team updated successfully' 
  });
});

export const deleteTeam = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  
  const deletedTeam = await Team.findByIdAndDelete(id);
  if (!deletedTeam) {
    return sendError(res, { statusCode: 404, message: 'Team not found' });
  }
  
  return sendSuccess(res, { 
    data: deletedTeam,
    message: 'Team deleted successfully' 
  });
});

export const getTeamsByLeague = catchAsyncError(async (req, res) => {
  const { leagueId } = req.params;
  
  const teams = await Team.find().sort({ name: 1 });
  
  return sendSuccess(res, { data: teams });
});
