const fs = require('fs');

   let data;
   try {
     data = fs.readFileSync('data.txt', 'utf8');
   } catch (err) {
     console.error('Error reading file:', err);
   }

   console.log(data);

   const hash = encodeHTML(location.hash.substring(1));
   document.getElementById("output").textContent = hash; // Use textContent to prevent XSS.