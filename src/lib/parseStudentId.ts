/**
 * Student ID Parser Utility
 * Parses student IDs to extract course type, department, semester, batch, roll number
 */

export interface ParsedStudentId {
    isValid: boolean;
    error?: string;

    // Detected values
    courseType: 'regular' | 'vocational' | 'pg' | null;
    prefix: string | null;           // BA, BSC, BCOM, BCA, BSCIT, BBA, etc.
    admissionYear: number | null;    // 2024, 2025, etc.
    deptCode: string | null;         // HIS, ECO, MAT, SC, IT, COM, etc.
    rollNumber: number | null;       // 69, 27, etc.

    // Calculated values
    semester: number | null;
    batch: string | null;            // "2025-29", "2024-27", etc.

    // For vocational - program variant
    programVariant: 'BCA' | 'BSCCA' | 'BSCIT' | 'BCOMCA' | 'BBA' | null;
    geSubjects: { ge1: string; ge2: string } | null;
}

// Department code to name mapping (for regular courses)
export const DEPT_CODE_MAP: Record<string, string> = {
    'HIS': 'History',
    'POL': 'Political Science',
    'ECO': 'Economics',
    'ENG': 'English',
    'HIN': 'Hindi',
    'PHI': 'Philosophy',
    'PHY': 'Physics',
    'CHE': 'Chemistry',
    'MAT': 'Mathematics',
    'BOT': 'Botany',
    'ZOO': 'Zoology',
    'COM': 'Commerce (B.Com.)',
};

// Vocational program variant to GE subjects mapping
const VOCATIONAL_GE_MAP: Record<string, { ge1: string; ge2: string }> = {
    'SC': { ge1: 'Physics', ge2: 'Mathematics' },      // B.Sc-CA
    'IT': { ge1: 'Physics', ge2: 'Mathematics' },      // B.Sc-IT
    'COM': { ge1: 'Accounts', ge2: 'Business Studies' }, // B.Com-CA
    'BA': { ge1: 'TBD', ge2: 'TBD' },                   // BBA (to be defined)
};

// Valid department codes for each regular course prefix
const BA_VALID_DEPTS = ['HIS', 'POL', 'ECO', 'ENG', 'HIN', 'PHI'];  // Arts departments only
const BSC_VALID_DEPTS = ['PHY', 'CHE', 'MAT', 'BOT', 'ZOO'];        // Science departments only
const BCOM_VALID_DEPTS = ['COM'];                                   // Commerce only

// Regular course prefixes
const REGULAR_PREFIXES = ['BA', 'BSC', 'BCOM'];

// Vocational course prefixes (order matters - longer first)
const VOCATIONAL_PREFIXES = ['BCOMCA', 'BSCCA', 'BSCIT', 'BCA', 'BBA'];

/**
 * Parse a Student ID and extract all relevant information
 */
export function parseStudentId(studentId: string): ParsedStudentId {
    const result: ParsedStudentId = {
        isValid: false,
        courseType: null,
        prefix: null,
        admissionYear: null,
        deptCode: null,
        rollNumber: null,
        semester: null,
        batch: null,
        programVariant: null,
        geSubjects: null,
    };

    if (!studentId || studentId.length < 10) {
        result.error = 'Student ID too short';
        return result;
    }

    const id = studentId.toUpperCase().trim();

    // Try to match vocational prefixes first (longer prefixes first)
    let matchedPrefix: string | null = null;
    let isVocational = false;

    for (const prefix of VOCATIONAL_PREFIXES) {
        if (id.startsWith(prefix)) {
            matchedPrefix = prefix;
            isVocational = true;
            break;
        }
    }

    // If not vocational, try regular prefixes
    if (!matchedPrefix) {
        for (const prefix of REGULAR_PREFIXES) {
            if (id.startsWith(prefix)) {
                matchedPrefix = prefix;
                break;
            }
        }
    }

    if (!matchedPrefix) {
        result.error = 'Unknown course prefix';
        return result;
    }

    result.prefix = matchedPrefix;
    result.courseType = isVocational ? 'vocational' : 'regular';

    // Extract year (4 digits after prefix)
    const afterPrefix = id.substring(matchedPrefix.length);
    const yearMatch = afterPrefix.match(/^(\d{4})/);

    if (!yearMatch) {
        result.error = 'Could not find admission year';
        return result;
    }

    result.admissionYear = parseInt(yearMatch[1]);

    // Extract department/variant code and roll number
    const afterYear = afterPrefix.substring(4);

    // Roll number is last 3 digits
    const rollMatch = afterYear.match(/(\d{2,3})$/);
    if (!rollMatch) {
        result.error = 'Could not find roll number';
        return result;
    }

    result.rollNumber = parseInt(rollMatch[1]);

    // Department/variant code is between year and roll
    const codeLength = afterYear.length - rollMatch[1].length;
    result.deptCode = afterYear.substring(0, codeLength);

    if (!result.deptCode || result.deptCode.length < 2) {
        result.error = 'Could not find department/variant code';
        return result;
    }

    // Validate department code matches the course prefix (for regular courses)
    if (!isVocational) {
        const deptUpper = result.deptCode.toUpperCase();
        if (matchedPrefix === 'BA' && !BA_VALID_DEPTS.includes(deptUpper)) {
            result.error = `'${result.deptCode}' is not valid for BA (Arts). Use: ${BA_VALID_DEPTS.join(', ')}`;
            return result;
        }
        if (matchedPrefix === 'BSC' && !BSC_VALID_DEPTS.includes(deptUpper)) {
            result.error = `'${result.deptCode}' is not valid for BSC (Science). Use: ${BSC_VALID_DEPTS.join(', ')}`;
            return result;
        }
        if (matchedPrefix === 'BCOM' && !BCOM_VALID_DEPTS.includes(deptUpper)) {
            result.error = `'${result.deptCode}' is not valid for BCOM. Use: ${BCOM_VALID_DEPTS.join(', ')}`;
            return result;
        }
    }

    // Calculate semester based on admission year
    // Late schedule: 2025 batch → Sem 1, 2024 batch → Sem 2
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-12

    // Simple calculation: year difference * 2, adjusted for late schedule
    let yearDiff = currentYear - result.admissionYear;

    // Late schedule adjustment: if in first half of year, they're still in odd semester
    // 2025 admission in Jan 2026 = Sem 1 (first semester, not completed)
    // 2024 admission in Jan 2026 = Sem 2 (second year, first half = odd semester of 2nd year? No, 2nd semester)
    // Based on user input: 2024 → Sem 2, 2025 → Sem 1
    // So semester = yearDiff * 2 + (currentMonth <= 6 ? 0 : 1) but capped

    // Simplified: Each year = 2 semesters
    // 2025 batch in 2026 = completed 0-1 semesters → currently in Sem 1
    // 2024 batch in 2026 = completed 1-2 semesters → currently in Sem 2 (late schedule)

    // User confirmed: 2024 → Sem 2, 2025 → Sem 1 (as of Jan 2026)
    if (yearDiff === 0) {
        result.semester = 1;
    } else if (yearDiff === 1) {
        result.semester = currentMonth <= 6 ? 2 : 3;
    } else if (yearDiff === 2) {
        result.semester = currentMonth <= 6 ? 4 : 5;
    } else if (yearDiff === 3) {
        result.semester = currentMonth <= 6 ? 6 : 7;
    } else {
        result.semester = Math.min(yearDiff * 2, isVocational ? 6 : 8);
    }

    // For user's specific case (late schedule in Jan 2026):
    // Override with simpler logic based on user's confirmation
    // 2025 → Sem 1, 2024 → Sem 2
    if (currentYear === 2026 && currentMonth <= 6) {
        if (result.admissionYear === 2025) result.semester = 1;
        else if (result.admissionYear === 2024) result.semester = 2;
        else if (result.admissionYear === 2023) result.semester = 4;
    }

    // Calculate batch
    const duration = isVocational ? 3 : 4;
    result.batch = `${result.admissionYear}-${(result.admissionYear + duration).toString().slice(-2)}`;

    // For vocational courses, determine program variant and GE subjects
    if (isVocational) {
        // Map prefix to program variant
        if (matchedPrefix === 'BCA' || matchedPrefix === 'BSCCA') {
            result.programVariant = result.deptCode === 'SC' ? 'BSCCA' : 'BCA';
        } else if (matchedPrefix === 'BSCIT') {
            result.programVariant = 'BSCIT';
        } else if (matchedPrefix === 'BCOMCA') {
            result.programVariant = 'BCOMCA';
        } else if (matchedPrefix === 'BBA') {
            result.programVariant = 'BBA';
        }

        // Get GE subjects based on variant code
        if (result.deptCode && VOCATIONAL_GE_MAP[result.deptCode]) {
            result.geSubjects = VOCATIONAL_GE_MAP[result.deptCode];
        }
    }

    result.isValid = true;
    return result;
}

/**
 * Get department code from database departments list
 */
export function findDepartmentByCode(
    departments: Array<{ id: string; code: string; name: string; dept_type: string }>,
    parsed: ParsedStudentId
): { id: string; name: string; code: string } | null {
    if (!parsed.isValid || !parsed.deptCode) return null;

    if (parsed.courseType === 'regular') {
        // For regular courses, deptCode maps directly to department code
        return departments.find(d =>
            d.code.toUpperCase() === parsed.deptCode?.toUpperCase() ||
            d.code.toUpperCase().startsWith(parsed.deptCode?.toUpperCase() || '')
        ) || null;
    } else if (parsed.courseType === 'vocational') {
        // For vocational, each program maps to its own department
        if (parsed.prefix === 'BBA') {
            return departments.find(d => d.code === 'BBA') || null;
        } else if (parsed.prefix === 'BSCIT') {
            return departments.find(d => d.code === 'IT') || null;
        } else {
            // BCA, BSCCA, BCOMCA all go to BCA department
            return departments.find(d => d.code === 'BCA') || null;
        }
    }

    return null;
}
