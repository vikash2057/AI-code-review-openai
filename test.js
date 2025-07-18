const fs = require('fs');

try {
  const data = fs.readFileSync('data.txt');
  console.log(data.toString());
} catch (error) {
  console.error('Error reading file:', error);
}

if (typeof window !== 'undefined') {
  // Check if running in a client-side context (browser)
  const hash = location.hash.substring(1);
  const outputElement = document.getElementById("output");
  if (outputElement) {
    outputElement.textContent = hash; // Use textContent to prevent XSS
  }
}

console.log("111");