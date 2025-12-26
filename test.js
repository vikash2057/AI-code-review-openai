const fs = require('fs');
const data = fs.readFileSync('data.txt');console.log(data.toString());

const hash = location.hash.substring(1);
document.getElementById("output").innerHTML = sanitize(hash);
console.log("testttttttttttt");