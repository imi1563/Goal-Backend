const catchAsyncError = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch((error=>{
        console.error(error);
       
        next(error);
    }));
  
  export default catchAsyncError;
