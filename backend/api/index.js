const createApp = require('../src/app');
const app = createApp();

module.exports = app;

// Disable Vercel's default body parser so that Express and Multer
// can process the raw request stream directly. This is strictly required
// for handling multipart/form-data file uploads on Vercel.
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
