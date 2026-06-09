const createApp = require('../src/app');
const app = createApp();

const config = {
  api: {
    bodyParser: false,
  },
};

module.exports = app;
module.exports.config = config;
