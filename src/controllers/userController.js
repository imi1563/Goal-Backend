import User from '../models/User.js';
import { sendSuccess, sendError, sendPaginatedResponse } from '../utils/response.js';
import catchAsyncError from '../utils/catchAsync.js';
import jwt from 'jsonwebtoken';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: '30d',
  });
};

export const getAllUsers = catchAsyncError(async (req, res) => {
  const { page = 1, limit = 10, search = '' } = req.query;
  
  const filter = {};
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    User.countDocuments(filter)
  ]);
  
  const totalPages = Math.ceil(total / parseInt(limit));
  
  return sendPaginatedResponse(
    res,
    parseInt(page),
    totalPages,
    total,
    users.map(user => {
      const userObj = user.toObject();
      delete userObj.password;
      return userObj;
    })
  );
});

export const getUserById = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  
  const user = await User.findById(id);
  if (!user) {
    return sendError(res, { statusCode: 404, message: 'User not found' });
  }
  
  const userObj = user.toObject();
  delete userObj.password;
  
  return sendSuccess(res, { data: userObj });
});

export const createUser = catchAsyncError(async (req, res) => {
  const { name, email, password } = req.body;
  
  const existingUser = await User.findOne({ email });
  
  if (existingUser) {
    return sendError(res, { 
      statusCode: 400, 
      message: 'User with this email already exists' 
    });
  }
  
  const newUser = new User({ name, email, password });
  await newUser.save();
  
  const token = generateToken(newUser._id);
  
  const userObj = newUser.toObject();
  delete userObj.password;
  
  return sendSuccess(res, { 
    statusCode: 201, 
    data: { user: userObj, token },
    message: 'User registered successfully' 
  });
});

export const createAdmin = catchAsyncError(async (req, res) => {
  const { name, email, password } = req.body;
  
  const existingUser = await User.findOne({ email });
  
  if (existingUser) {
    return sendError(res, { 
      statusCode: 400, 
      message: 'User with this email already exists' 
    });
  }
  
  const newAdmin = new User({ 
    name, 
    email, 
    password, 
    role: 'admin'
  });
  
  await newAdmin.save();
  
  const token = generateToken(newAdmin._id);
  
  const userObj = newAdmin.toObject();
  delete userObj.password;
  
  return sendSuccess(res, { 
    statusCode: 201, 
    data: { user: userObj, token },
    message: 'Admin user created successfully' 
  });
});

export const loginUser = catchAsyncError(async (req, res) => {
  const { email, password } = req.body;
  
  const user = await User.findOne({ email });
  
  if (!user) {
    return sendError(res, { 
      statusCode: 401, 
      message: 'Invalid email or password' 
    });
  }
  
  const isMatch = await user.matchPassword(password);
  
  if (!isMatch) {
    return sendError(res, { 
      statusCode: 401, 
      message: 'Invalid email or password' 
    });
  }
  
  const token = generateToken(user._id);
  
  const userObj = user.toObject();
  delete userObj.password;
  
  return sendSuccess(res, { 
    data: { user: userObj, token },
    message: 'Login successful' 
  });
});

export const updateUser = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  
  if (updateData.password === undefined) {
    delete updateData.password;
  }
  
  const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
  if (!updatedUser) {
    return sendError(res, { statusCode: 404, message: 'User not found' });
  }
  
  const userObj = updatedUser.toObject();
  delete userObj.password;
  
  return sendSuccess(res, { 
    data: userObj,
    message: 'User updated successfully' 
  });
});

export const deleteUser = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  
  const deletedUser = await User.findByIdAndDelete(id);
  if (!deletedUser) {
    return sendError(res, { statusCode: 404, message: 'User not found' });
  }
  
  const userObj = deletedUser.toObject();
  delete userObj.password;
  
  return sendSuccess(res, { 
    data: userObj,
    message: 'User deleted successfully' 
  });
});

export const getProfile = catchAsyncError(async (req, res) => {
  const user = req.user;
  
  if (!user) {
    return sendError(res, { statusCode: 401, message: 'Authentication required' });
  }
  
  const userObj = user.toObject();
  delete userObj.password;
  
  return sendSuccess(res, { data: userObj });
});
