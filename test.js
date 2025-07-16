email="sdfd"
const fs = require('fs');
const data = fs.readFileSync('data.txt');
console.log(data.toString())
const query = "SELECT * FROM users WHERE email = '" + email + "'";

