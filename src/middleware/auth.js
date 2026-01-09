import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { sendError } from '../utils/response.js';

export const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return sendError(res, { 
        statusCode: 401, 
        message: 'Not authorized to access this route' 
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return sendError(res, { 
          statusCode: 401, 
          message: 'User not found' 
        });
      }

      req.user = user;
      next();
    } catch (error) {
      return sendError(res, { 
        statusCode: 401, 
        message: 'Not authorized to access this route' 
      });
    }
  } catch (error) {
    return sendError(res, { 
      statusCode: 500, 
      message: 'Server error' 
    });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, { 
        statusCode: 401, 
        message: 'Not authorized to access this route' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return sendError(res, { 
        statusCode: 403, 
        message: 'User role is not authorized to access this route' 
      });
    }

    next();
  };
};
