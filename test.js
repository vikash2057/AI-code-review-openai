const fs = require('fs');
const path = require('path');

const fileName = 'data.txt';

// Validate and sanitize the file name
if (typeof fileName !== 'string' || !fileName.match(/^[\w,\s-]+\.[A-Za-z]{3}$/)) {
    console.error('Invalid file name');
} else {
    const filePath = path.resolve(__dirname, fileName);

    try {
        const data = fs.readFileSync(filePath);
        console.log(data.toString());
    } catch (error) {
        console.error('Error reading file:', error);
    }
}