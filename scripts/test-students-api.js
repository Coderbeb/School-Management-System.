const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

const secret = process.env.JWT_SECRET || 'fallback-secret';

const payload = {
    userId: '1eecb817-4256-4bf7-962e-1964e85e7b16',
    email: 'jane.doe.test@school.com',
    role: 'student',
    schoolId: '5f1e4197-a40e-427b-b25a-13d78a14d998'
};

const token = jwt.sign(payload, secret);

const http = require('http');

const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/students?userId=1eecb817-4256-4bf7-962e-1964e85e7b16',
    method: 'GET',
    headers: {
        'Authorization': `Bearer ${token}`
    }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log("Response status:", res.statusCode);
        console.log("Response body:", data);
    });
});

req.on('error', (e) => {
    console.error("Request failed:", e.message);
});

req.end();
