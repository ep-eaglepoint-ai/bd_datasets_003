const http = require('http');
const { createApp } = require('./app');
const config = require('../config');

function startServer(port = config.serverPort) {
  const { app, db } = createApp();
  const server = http.createServer(app);

  return new Promise((resolve) => {
    server.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Server listening on port ${port}`);
      resolve({
        app,
        db,
        server,
        port,
        async stop() {
          await new Promise((res) => server.close(res));
          await db.close();
        }
      });
    });
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start server', err);
    process.exit(1);
  });
}

module.exports = {
  startServer
};


