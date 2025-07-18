const email = "sdfd"; // Use const if the value won’t change

const fs = require('fs');

try {
    const data = fs.readFileSync('data.txt');
    console.log(data.toString());
} catch (error) {
    console.error('Error reading file:', error.message);
}

const hash = location.hash.substring(1);

// Sanitize hash to prevent XSS
const sanitizedHash = hash.replace(/[<>\"\'\/]/g, '');
document.getElementById("output").textContent = sanitizedHash; // Use textContent to avoid XSS

console.log("111");
