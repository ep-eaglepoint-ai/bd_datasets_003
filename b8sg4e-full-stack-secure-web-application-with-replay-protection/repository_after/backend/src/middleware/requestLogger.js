const morgan = require('morgan');
const logger = require('../utils/logger');

const stream = {
    write: (message) => {
        logger.info(message.trim());
    },
};

const requestLogger = morgan(
    ':method :url :status :res[content-length] - :response-time ms',
    { stream }
);

const detailedRequestLogger = (req, res, next) => {
    const startTime = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const logData = {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            userId: req.user?.id || 'anonymous',
            userAgent: req.get('User-Agent'),
        };

        if (res.statusCode >= 400) {
            logger.warn('Request failed', logData);
        } else {
            logger.info('Request completed', logData);
        }
    });

    next();
};

module.exports = {
    requestLogger,
    detailedRequestLogger,
};
