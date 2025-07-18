const fs = require('fs');

try {
    const data = fs.readFileSync('data.txt');
    console.log(data.toString());
} catch (error) {
    console.error('Error reading file:', error);
}

const hash = location.hash.substring(1);

// Simple sanitization example: remove any script tags
const sanitizedHash = hash.replace(/<script.*?>.*?<\/script>/gi, '');

document.getElementById("output").innerHTML = sanitizedHash;
console.log("Operation completed");