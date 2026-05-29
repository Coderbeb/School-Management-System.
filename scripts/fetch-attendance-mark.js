const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

const secret = process.env.JWT_SECRET || 'fallback-secret';

const payload = {
    userId: '414369dc-a2d5-4b9c-974d-3f3176e55a46',
    email: 'john@school.com',
    role: 'teacher',
    schoolId: '5f1e4197-a40e-427b-b25a-13d78a14d998'
};

const token = jwt.sign(payload, secret);

const http = require('http');

const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/attendance/mark?classSectionId=c74e8acf-9eea-4457-bd57-99a267f27e81&sessionId=db8a75af-1927-4896-83d4-027b7a7377f4&subjectId=8053f86b-73ec-4436-9a51-3811b6fa19fe',
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
