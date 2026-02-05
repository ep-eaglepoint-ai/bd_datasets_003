const CryptoJS = require('crypto-js');
const config = require('../config');

const encrypt = (text) => {
    if (!text) return text;
    return CryptoJS.AES.encrypt(text.toString(), config.encryption.key).toString();
};

const decrypt = (ciphertext) => {
    if (!ciphertext) return ciphertext;
    const bytes = CryptoJS.AES.decrypt(ciphertext, config.encryption.key);
    return bytes.toString(CryptoJS.enc.Utf8);
};

const hashData = (data) => {
    return CryptoJS.SHA256(JSON.stringify(data)).toString();
};

module.exports = {
    encrypt,
    decrypt,
    hashData,
};
