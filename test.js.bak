const fs = require('fs');

try {
    const data = fs.readFileSync('data.txt');
    console.log(data.toString());
} catch (error) {
    console.error('Error reading file:', error);
}

const hash = location.hash.substring(1);

// Simple sanitization example to prevent XSS
const sanitizeHTML = (str) => {
    return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
};

document.getElementById("output").innerHTML = sanitizeHTML(hash);