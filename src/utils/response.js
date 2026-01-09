export const sendSuccess = (
  res,
  { statusCode = 200, data = null, message = "Success" } = {}
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

export const sendError = (
  res,
  { statusCode = 500, message = "", error = null } = {}
) => {
  return res.status(statusCode).json({
    success: false,
    error: error || message,
  });
};

export const sendPaginatedResponse = (
  res,
  pageNumber,
  totalPages,
  totalItems,
  items
) => {
  const paginationData = {
    currentPage: pageNumber,
    totalPages,
    totalItems,
    items,
  };

  return sendSuccess(res, { data: paginationData });
};
