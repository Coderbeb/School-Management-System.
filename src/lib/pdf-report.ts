import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

// ============================================================
// PDF Report Card Generator (Puppeteer)
// Uses the EXACT same HTML template as the HOD download function
// Renders it in a headless browser and converts to PDF
// ============================================================

export interface PDFReportData {
    studentName: string;
    studentId?: string;
    rollNumber: string | number;
    department: string;
    semester: number;
    totalClasses: number;
    attendedClasses: number;
    percentage: number;
    hodName: string; // Department HOD's name for footer
    reportPeriod?: string; // e.g. "1 April 2026 – 30 April 2026"
    subjects?: {
        name: string;
        code?: string;
        paperCode?: string;
        totalClasses: number;
        attended: number;
        percentage: number;
    }[];
    // Dynamic school branding (fetched from school_settings)
    schoolBranding?: {
        schoolName?: string;
        address?: string;
        tagline?: string;
        logoUrl?: string | null;
        primaryColor?: string;
        accentColor?: string;
        footerText?: string;
    };
}

/**
 * Reads the college logo and converts to base64 data URL.
 * Falls back to a URL if provided (for remote logos).
 */
function getLogoBase64(remoteLogoUrl?: string | null): string {
    // If a remote URL is provided (e.g., from school branding), use it directly
    if (remoteLogoUrl && (remoteLogoUrl.startsWith('http') || remoteLogoUrl.startsWith('data:'))) {
        return remoteLogoUrl;
    }
    try {
        const logoPath = path.join(process.cwd(), 'public', 'college-logo.png');
        const logoBuffer = fs.readFileSync(logoPath);
        return `data:image/png;base64,${logoBuffer.toString('base64')}`;
    } catch {
        return '';
    }
}

/**
 * Generates the EXACT same HTML as the HOD download report card.
 * This is a direct copy of the downloadReportCard() HTML from the student reports page.
 */
function generateReportHTML(data: PDFReportData): string {
    const branding = data.schoolBranding || {};
    const logoUrl = getLogoBase64(branding.logoUrl);
    const currentDate = new Date().toLocaleDateString('en-IN');
    const schoolName = branding.schoolName || 'School Management System';
    const schoolAddress = branding.address || '';
    const schoolTagline = branding.tagline || 'School Management System';
    const primaryColor = branding.primaryColor || '#1e3a8a';
    const accentColor = branding.accentColor || '#b45309';

    const getStatus = (pct: number) => {
        if (pct >= 75) return { text: 'GOOD STANDING', color: '#16a34a' };
        if (pct >= 60) return { text: 'WARNING', color: '#ca8a04' };
        return { text: 'CRITICAL', color: '#dc2626' };
    };
    const status = getStatus(data.percentage);

    const subjects = data.subjects || [];
    const subjectRows = subjects.map(sub => `
        <tr>
            <td style="font-weight: 600;">${sub.name}</td>
            <td style="color: var(--text-sub); font-size: 11px;">${sub.paperCode || sub.code || '-'}</td>
            <td class="cell-center">${sub.totalClasses}</td>
            <td class="cell-center">${sub.attended}</td>
            <td class="cell-center">
                <span class="badge-status ${sub.percentage >= 75 ? 'bg-green' : sub.percentage >= 60 ? 'bg-amber' : 'bg-red'}">
                    ${sub.percentage >= 75 ? 'Good' : sub.percentage >= 60 ? 'Avg' : 'Low'}
                </span>
            </td>
        </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
    <title>Report Card - ${data.studentName}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600;700&display=swap');
        
        :root {
            --primary: ${primaryColor};
            --accent: ${accentColor};
            --light: #f8fafc;
            --border: #e2e8f0;
            --text-main: #1e293b;
            --text-sub: #64748b;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
            font-family: 'Inter', sans-serif; 
            background: #fff; 
            color: var(--text-main); 
            padding: 0;
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
        }

        @page { size: A4; margin: 0; }

        .container { 
            max-width: 100%; 
            margin: 0 auto; 
            border: 1px solid var(--border); 
            min-height: 900px; 
            position: relative; 
            background: white;
            box-shadow: none;
        }

        .top-bar {
            height: 6px;
            background: linear-gradient(90deg, var(--primary) 0%, var(--primary) 85%, var(--accent) 85%, var(--accent) 100%);
            width: 100%;
        }
        
        .content-padding { padding: 30px; }

        .header { 
            display: flex; 
            align-items: center; 
            justify-content: space-between; 
            border-bottom: 2px solid var(--border); 
            padding-bottom: 20px; 
            margin-bottom: 25px; 
            position: relative;
        }

        .logo-section { display: flex; align-items: center; gap: 15px; }
        .logo-img { height: 60px; width: auto; object-fit: contain; }
        
        .college-info h1 { 
            font-family: 'Playfair Display', serif; 
            font-size: 20px; 
            color: var(--primary); 
            text-transform: uppercase; 
            margin-bottom: 2px; 
            letter-spacing: 0.5px;
        }
        
        .college-info p { 
            font-size: 10px; 
            color: var(--text-sub); 
            margin-bottom: 1px; 
            font-weight: 500; 
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .badge-container {
            position: absolute;
            top: -30px;
            right: 0;
        }
        .ribbon {
            background: var(--accent);
            color: white;
            padding: 8px 16px; 
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            border-bottom-left-radius: 4px;
            border-bottom-right-radius: 4px;
        }
        
        .watermark { 
            position: absolute; 
            top: 50%; 
            left: 50%; 
            transform: translate(-50%, -50%); 
            width: 300px; 
            opacity: 0.04; 
            pointer-events: none; 
            z-index: 0; 
            filter: grayscale(100%);
        }
        
        .info-card { 
            background: #eff6ff;
            border-left: 4px solid var(--primary);
            padding: 16px; 
            border-radius: 4px;
            margin-bottom: 20px; 
            position: relative; 
            z-index: 1; 
            display: flex;
            justify-content: space-between;
        }

        .student-name {
            font-family: 'Playfair Display', serif;
            font-size: 18px; 
            color: var(--primary);
            margin-bottom: 2px;
        }
        
        .student-roll {
            color: var(--text-sub);
            font-size: 11px;
            font-weight: 500;
        }

        .meta-values {
            text-align: right;
            font-size: 11px; 
            color: var(--text-sub);
        }
        .meta-values strong { color: var(--text-main); font-weight: 600; margin-right: 4px; }
        .meta-row { margin-bottom: 2px; }

        .filters-banner {
            background: #f0f9ff;
            border: 1px solid #bae6fd;
            border-radius: 4px;
            padding: 10px 16px;
            margin-bottom: 20px;
            position: relative;
            z-index: 1;
            display: flex;
            gap: 24px;
            flex-wrap: wrap;
        }
        .filter-item {
            font-size: 10px;
            color: var(--text-sub);
        }
        .filter-item strong {
            color: #0369a1;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-right: 6px;
        }

        .stats-grid { 
            display: grid; 
            grid-template-columns: repeat(3, 1fr); 
            gap: 12px; 
            margin-bottom: 25px; 
            position: relative; 
            z-index: 1; 
        }
        
        .stat-item { 
            border: 1px solid var(--border); 
            padding: 10px; 
            text-align: center; 
            border-radius: 4px;
        }
        
        .stat-val { 
            font-family: 'Playfair Display', serif;
            font-size: 22px; 
            color: var(--primary); 
            font-weight: 700;
            line-height: 1.2;
        }
        
        .stat-lbl { 
            font-size: 9px; 
            text-transform: uppercase; 
            color: var(--accent); 
            font-weight: 700; 
            letter-spacing: 0.5px;
            margin-top: 4px;
        }
        
        .section-title { 
            display: flex; 
            align-items: center; 
            margin-bottom: 12px; 
            color: var(--primary);
            font-weight: 700;
            font-size: 11px; 
            text-transform: uppercase;
            letter-spacing: 1px;
            border-bottom: 1px solid var(--border);
            padding-bottom: 6px;
        }
        
        table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 25px; 
            font-size: 11px; 
            position: relative; 
            z-index: 1; 
        }
        
        th { 
            text-align: left; 
            padding: 8px 10px; 
            background: var(--primary); 
            color: white; 
            font-weight: 600; 
            text-transform: uppercase; 
            font-size: 10px; 
            letter-spacing: 0.5px; 
        }
        
        td { 
            padding: 8px 10px; 
            border-bottom: 1px solid var(--border); 
            color: var(--text-main); 
        }
        
        tr:nth-child(even) { background-color: #f8fafc; }
        .cell-center { text-align: center; }
        
        .badge-status {
            display: inline-block;
            padding: 2px 8px; 
            border-radius: 50px;
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .bg-green { background: #dcfce7; color: #166534; }
        .bg-amber { background: #fef3c7; color: #b45309; }
        .bg-red { background: #fee2e2; color: #991b1b; }

        .conclusion {
            background: #fff;
            border: 1px solid var(--border);
            border-top: 3px solid var(--accent);
            padding: 15px; 
            border-radius: 4px;
            margin-top: auto;
        }
        .conclusion h3 { font-size: 11px; color: var(--accent); text-transform: uppercase; margin-bottom: 4px; }
        .conclusion p { font-size: 11px; line-height: 1.5; color: var(--text-sub); }

        .footer { 
            margin-top: 25px; 
            padding-top: 15px; 
            border-top: 1px solid var(--border); 
            display: flex; 
            justify-content: space-between; 
            font-size: 9px; 
            color: var(--text-sub);
            text-transform: uppercase;
            letter-spacing: 1px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="top-bar"></div>
        <div class="content-padding">
            ${logoUrl ? `<img src="${logoUrl}" class="watermark" />` : ''}
            
            <div class="badge-container">
                <div class="ribbon">Student Report</div>
            </div>

            <header class="header">
                <div class="logo-section">
                    ${logoUrl ? `<img src="${logoUrl}" class="logo-img" alt="${schoolName}">` : ''}
                    <div class="college-info">
                        <h1>${schoolName}</h1>
                        <p>${schoolTagline}</p>
                        <p>${schoolAddress}</p>
                    </div>
                </div>
            </header>

            <div class="info-card">
                <div>
                    <h2 class="student-name">${data.studentName}</h2>
                    <div class="student-roll">Student ID: ${data.studentId || '-'} | Roll No: ${data.rollNumber}</div>
                </div>
                <div class="meta-values">
                    <div class="meta-row"><strong>Classroom:</strong> ${data.department}</div>
                    <div class="meta-row"><strong>Date:</strong> ${currentDate}</div>
                </div>
            </div>

            <div class="filters-banner">
                <div class="filter-item"><strong>Period:</strong> ${data.reportPeriod || 'All Time'}</div>
                <div class="filter-item"><strong>Subjects:</strong> All Subjects</div>
            </div>

            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-val">${data.totalClasses}</div>
                    <div class="stat-lbl">Total Classes</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val" style="color: #059669">${data.attendedClasses}</div>
                    <div class="stat-lbl">Attended</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val" style="color: ${status.color}">${data.percentage}%</div>
                    <div class="stat-lbl">Attendance Rate</div>
                </div>
            </div>

            <div class="section-title">Subject-wise Breakdown</div>
            <table>
                <thead>
                    <tr>
                        <th style="border-radius: 4px 0 0 0;">Subject</th>
                        <th>Code</th>
                        <th class="cell-center">Total</th>
                        <th class="cell-center">Attended</th>
                        <th style="border-radius: 0 4px 0 0; text-align: center;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${subjectRows}
                </tbody>
            </table>

            <div class="conclusion">
                <h3>${status.text}</h3>
                <p>
                    ${data.percentage >= 75
            ? 'Student maintains good attendance record. Keep up the consistent engagement in classes.'
            : data.percentage >= 60
                ? 'Attendance is within acceptable limits but implies scope for improvement. Regularity is advised.'
                : 'Critical attendance shortage detected. Immediate improvement is required to meet college standards.'}
                </p>
            </div>

            <footer class="footer">
                <div>Staff In-charge: ${data.hodName}</div>
                <div>Authorized Signature: _______________________</div>
            </footer>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generates a PDF report card using Puppeteer (headless Chrome).
 * Produces a pixel-identical PDF to the HOD browser download.
 * Returns a Buffer containing the PDF data.
 */
export async function generateReportCardPDF(data: PDFReportData): Promise<Buffer> {
    const html = generateReportHTML(data);

    // Use a writable directory for Puppeteer's Chrome profile
    const userDataDir = path.join(process.cwd(), '.next', 'puppeteer-profile');
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }

    const browser = await puppeteer.launch({
        headless: true,
        userDataDir,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
        ],
        env: {
            ...process.env,
            TMPDIR: path.join(process.cwd(), '.next'),
            TEMP: path.join(process.cwd(), '.next'),
            TMP: path.join(process.cwd(), '.next'),
        },
    });

    try {
        const page = await browser.newPage();

        // Set the HTML content and wait for fonts to load
        await page.setContent(html, { waitUntil: 'networkidle0' });

        // Generate PDF matching A4 size (same as HOD's @page { size: A4 })
        const pdfUint8Array = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
        });

        return Buffer.from(pdfUint8Array);
    } finally {
        await browser.close();
    }
}

