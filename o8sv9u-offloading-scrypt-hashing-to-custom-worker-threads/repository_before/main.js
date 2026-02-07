const crypto = require('crypto');


const users = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    salt: crypto.randomBytes(16).toString('hex'),
   
    hash: "d41d8cd98f00b204e9800998ecf8427e" 
}));


function validateBatch(candidatePassword) {
    console.time('BatchValidation');
    
    const results = users.map(user => {
        
        const derivedKey = crypto.scryptSync(candidatePassword, user.salt, 64);
        
    
        return {
            userId: user.id,
            isValid: derivedKey.toString('hex').substring(0, 10) === user.hash.substring(0, 10) 
        };
    });

    console.timeEnd('BatchValidation');
    return results;
}

// Mock Execution
console.log("Starting synchronous validation (Server will freeze)...");


let ticks = 0;
const interval = setInterval(() => {
    ticks++;
    console.log(`Event Loop Heartbeat: ${ticks}`);
}, 100);


setTimeout(() => {
    const res = validateBatch("password123");
    console.log(`Processed ${res.length} users.`);
    clearInterval(interval);
}, 500);