const fs = require('fs');

try {
    const data = fs.readFileSync('data.txt');
    console.log(data.toString());
} catch (error) {
    console.error('Error reading file:', error);
}

// Assuming this part of the code is intended for a browser environment
if (typeof window !== 'undefined') {
    const hash = location.hash.substring(1);

    // Validate and sanitize the hash before using it
    const sanitizedHash = hash.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    document.getElementById("output").innerHTML = sanitizedHash;
}

// Consider using a logging library for better log management
console.log("Log message");