const fs = require('fs');
const key = fs.readFileSync('./move-nest-aaaba-firebase-adminsdk-fbsvc-3ab9ff17fa.json', 'utf8')
const base64 = Buffer.from(key).toString('base64')
console.log(base64)