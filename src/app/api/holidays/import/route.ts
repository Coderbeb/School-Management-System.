import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Access denied. Only super admins can import holidays.' }, { status: 403 });
        }

        const { holidays } = await request.json();

        if (!Array.isArray(holidays) || holidays.length === 0) {
            return NextResponse.json({ error: 'No holidays data provided' }, { status: 400 });
        }

        let success = 0;
        let failed = 0;
        const errors: { row: number; name: string; error: string }[] = [];
        const validHolidays: { name: string; date: string; description: string | null }[] = [];

        for (let i = 0; i < holidays.length; i++) {
            const row = holidays[i];
            const name = (row.name || row.holiday_name || row.holiday || '').toString().trim();
            let dateStr = (row.date || row.holiday_date || '').toString().trim();
            const description = (row.description || row.desc || row.remarks || '').toString().trim() || null;

            if (!name) {
                failed++;
                errors.push({ row: i + 1, name: name || 'Unknown', error: 'Holiday name is required' });
                continue;
            }

            if (!dateStr) {
                failed++;
                errors.push({ row: i + 1, name, error: 'Date is required' });
                continue;
            }

            // Handle various date formats
            // DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY, YYYY-MM-DD, Excel serial numbers
            let parsedDate: Date | null = null;

            // Check if it's an Excel serial number (just a number)
            if (/^\d+$/.test(dateStr) && parseInt(dateStr) > 40000) {
                // Excel serial date conversion
                const excelEpoch = new Date(1899, 11, 30);
                parsedDate = new Date(excelEpoch.getTime() + parseInt(dateStr) * 86400000);
            } else if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
                // YYYY-MM-DD (ISO format)
                parsedDate = new Date(dateStr);
            } else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(dateStr)) {
                // DD/MM/YYYY or DD-MM-YYYY (assume DD/MM/YYYY for Indian format)
                const parts = dateStr.split(/[\/\-]/);
                const day = parseInt(parts[0]);
                const month = parseInt(parts[1]) - 1;
                const year = parseInt(parts[2]);
                parsedDate = new Date(year, month, day);
            } else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2}$/.test(dateStr)) {
                // DD/MM/YY
                const parts = dateStr.split(/[\/\-]/);
                const day = parseInt(parts[0]);
                const month = parseInt(parts[1]) - 1;
                let year = parseInt(parts[2]);
                year = year < 50 ? 2000 + year : 1900 + year;
                parsedDate = new Date(year, month, day);
            } else {
                // Try native Date parse as fallback
                parsedDate = new Date(dateStr);
            }

            if (!parsedDate || isNaN(parsedDate.getTime())) {
                failed++;
                errors.push({ row: i + 1, name, error: `Invalid date format: "${dateStr}"` });
                continue;
            }

            // Format to YYYY-MM-DD for PostgreSQL
            const formattedDate = parsedDate.toISOString().split('T')[0];

            validHolidays.push({ name, date: formattedDate, description });
            success++;
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            if (validHolidays.length > 0) {
                const CHUNK_SIZE = 100;
                for (let i = 0; i < validHolidays.length; i += CHUNK_SIZE) {
                    const chunk = validHolidays.slice(i, i + CHUNK_SIZE);
                    const values: string[] = [];
                    const params: any[] = [];
                    chunk.forEach((h, idx) => {
                        const offset = idx * 3;
                        values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
                        params.push(h.name, h.date, h.description);
                    });
                    
                    await client.query(
                        `INSERT INTO holidays (name, date, description)
                         VALUES ${values.join(', ')}
                         ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name, description = COALESCE(EXCLUDED.description, holidays.description)`,
                        params
                    );
                }
            }

            await client.query('COMMIT');
            
            return NextResponse.json({
                success,
                failed,
                total: holidays.length,
                errors: errors.slice(0, 10) // Limit error details
            });
        } catch (dbError: any) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('Holiday DB insertion error:', dbError);
            return NextResponse.json({ error: 'Database error during import' }, { status: 500 });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Holiday import error:', error);
        return NextResponse.json({ error: 'Server error during import' }, { status: 500 });
    }
}
