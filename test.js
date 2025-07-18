const fs = require('fs');

try {
    const data = fs.readFileSync('data.txt');
    console.log(data.toString());
} catch (error) {
    console.error('Error reading file:', error);
}

const urlFragment = location.hash.substring(1);

// Improved sanitization: remove potentially dangerous characters
const sanitizedHash = urlFragment.replace(/[<>]/g, '');

const outputElement = document.getElementById("output");
if (outputElement) {
    outputElement.textContent = sanitizedHash; // Use textContent to avoid XSS
} else {
    console.error('Output element not found');
}

console.log("Operation completed");