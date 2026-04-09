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
 * Batch config type: mapping of semester number (as string) to batch year (or null)
 * Example: { "regular": { "1": 2025, "2": 2024, "3": 2023, ... }, "vocational": { ... } }
 */
export type BatchConfig = Record<string, Record<string, number | null>>;

/**
 * Parse a Student ID and extract all relevant information.
 * @param studentId - The student ID string
 * @param batchConfig - Optional batch config from admin settings for accurate semester mapping
 */
export function parseStudentId(studentId: string, batchConfig?: BatchConfig): ParsedStudentId {
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
    // Priority: 1) Admin's saved batch config  2) Dynamic year-diff calculation
    const maxSem = isVocational ? 6 : 8;
    let semesterFound = false;

    // 1) Try admin's batch config (reverse lookup: find semester where batch year matches admission year)
    if (batchConfig && result.admissionYear) {
        const courseType = isVocational ? 'vocational' : 'regular';
        const mappings = batchConfig[courseType];
        if (mappings && Object.keys(mappings).length > 0) {
            for (const [semStr, batchYear] of Object.entries(mappings)) {
                if (batchYear === result.admissionYear) {
                    result.semester = parseInt(semStr);
                    semesterFound = true;
                    break;
                }
            }
            // If admission year not found in config, it may be an older/newer batch
            // Fall through to dynamic calculation
        }
    }

    // 2) Fallback: Dynamic calculation based on year difference
    if (!semesterFound) {
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1; // 1-12

        // Each academic year has 2 semesters
        // Jan-Jun = even semester (2nd half of academic year)
        // Jul-Dec = odd semester (1st half of new academic year)
        const yearDiff = currentYear - result.admissionYear;

        if (yearDiff <= 0) {
            result.semester = 1;
        } else {
            // In first half of year (Jan-Jun): yearDiff * 2 (even semester)
            // In second half of year (Jul-Dec): yearDiff * 2 + 1 (odd semester)
            result.semester = currentMonth <= 6
                ? Math.min(yearDiff * 2, maxSem)
                : Math.min(yearDiff * 2 + 1, maxSem);
        }
    }

    // Calculate batch label
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
