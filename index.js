'use strict';

const path = require('node:path');
const express = require('express');

function createApp() {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.static(path.join(__dirname, 'public'), {
        etag: true,
        maxAge: 0,
    }));
    return app;
}

if (require.main === module) {
    const port = Number(process.env.PORT || 8080);
    const app = createApp();
    app.listen(port, '127.0.0.1', () => {
        console.log(`MySpotBackup is running at http://127.0.0.1:${port}`);
    });
}

module.exports = { createApp };
