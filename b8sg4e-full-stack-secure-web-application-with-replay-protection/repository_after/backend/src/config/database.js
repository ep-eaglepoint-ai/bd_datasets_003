const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../utils/logger');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(config.mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        logger.info(`MongoDB Connected: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        logger.error(`MongoDB connection error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
