'use client';

import React from 'react';

interface CertificateData {
    student_name?: string;
    father_name?: string;
    mother_name?: string;
    class?: string;
    section?: string;
    admission_number?: string;
    date_of_birth?: string;
    address?: string;
    school_name?: string;
    school_address?: string;
    school_city?: string;
    school_phone?: string;
    school_email?: string;
    affiliation_number?: string;
    principal_name?: string;
    date?: string;
    certificate_number?: string;
    verification_code?: string;
    academic_year?: string;
    admission_date?: string;
    gender?: string;
    roll_number?: string;
    nationality?: string;
    religion?: string;
    caste_category?: string;
    // TC-specific
    date_of_leaving?: string;
    reason_for_leaving?: string;
    conduct?: string;
    last_exam_passed?: string;
    subjects_studied?: string;
    fee_concession?: string;
    // Bonafide-specific
    purpose?: string;
    [key: string]: string | undefined;
}

const borderStyle: React.CSSProperties = {
    border: '3px solid #1a365d',
    borderRadius: '2px',
    position: 'relative',
    background: '#fff',
};

const innerBorderStyle: React.CSSProperties = {
    border: '1px solid #2d4a7a',
    margin: '6px',
    padding: '30px 40px',
    minHeight: '700px',
    position: 'relative',
};

const headerStyle: React.CSSProperties = {
    textAlign: 'center',
    borderBottom: '2px solid #1a365d',
    paddingBottom: '15px',
    marginBottom: '20px',
};

const schoolNameStyle: React.CSSProperties = {
    fontSize: '24px',
    fontWeight: 800,
    color: '#1a365d',
    fontFamily: "'Georgia', 'Times New Roman', serif",
    letterSpacing: '2px',
    textTransform: 'uppercase',
    margin: 0,
};

const certTitleStyle: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 700,
    color: '#c53030',
    fontFamily: "'Georgia', serif",
    letterSpacing: '3px',
    textTransform: 'uppercase',
    marginTop: '8px',
    marginBottom: '4px',
};

const fieldRowStyle: React.CSSProperties = {
    display: 'flex',
    marginBottom: '6px',
    fontSize: '13px',
    lineHeight: '1.8',
    fontFamily: "'Georgia', serif",
};

const labelStyle: React.CSSProperties = {
    fontWeight: 700,
    color: '#2d3748',
    minWidth: '200px',
    flexShrink: 0,
};

const valueStyle: React.CSSProperties = {
    color: '#1a202c',
    borderBottom: '1px dotted #a0aec0',
    flex: 1,
    paddingLeft: '8px',
    fontWeight: 600,
};

const signatureStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '60px',
    paddingTop: '10px',
    fontSize: '12px',
    fontFamily: "'Georgia', serif",
    fontWeight: 600,
};

const verifyStyle: React.CSSProperties = {
    fontSize: '9px',
    color: '#718096',
    textAlign: 'center',
    marginTop: '20px',
    borderTop: '1px solid #e2e8f0',
    paddingTop: '8px',
    fontFamily: 'monospace',
};

// ============================================================
// TRANSFER CERTIFICATE (TC)
// ============================================================
export function TransferCertificate({ data }: { data: CertificateData }) {
    const pronounHis = data.gender === 'female' ? 'Her' : 'His';
    const pronounHeShe = data.gender === 'female' ? 'She' : 'He';

    const fields = [
        ['S.No. of Admission Register', data.admission_number],
        ['Name of Pupil', data.student_name],
        ["Father's Name", data.father_name],
        ["Mother's Name", data.mother_name],
        ['Nationality', data.nationality || 'Indian'],
        ['Date of Birth (in figures & words)', data.date_of_birth],
        ['Class in which the pupil last studied', `${data.class}${data.section ? ' - ' + data.section : ''}`],
        ['School / Board Annual Examination last taken', data.last_exam_passed || 'N/A'],
        ['Whether qualified for promotion to higher class', 'Yes'],
        ['Month up to which the pupil has paid school dues', ''],
        ['Any fee concession availed of', data.fee_concession || 'None'],
        ['Total Working Days', ''],
        ['Total Present Days', ''],
        ['Whether NCC/Scout/Guide', ''],
        ['Games played or extra-curricular activities', ''],
        ['General Conduct', data.conduct || 'Good'],
        ['Date of Application', ''],
        ['Date of Issue of Certificate', data.date],
        ['Reason for leaving the school', data.reason_for_leaving || ''],
        ['Date of leaving', data.date_of_leaving || data.date],
        [`Qualified for ${pronounHis.toLowerCase()} promotion`, `Yes - ${pronounHeShe} has been promoted`],
    ];

    return (
        <div style={{ ...borderStyle, width: '210mm', minHeight: '297mm', margin: '0 auto', fontFamily: "'Georgia', serif" }} className="print-certificate">
            <div style={innerBorderStyle}>
                <div style={headerStyle}>
                    <p style={{ fontSize: '11px', color: '#4a5568', margin: '0 0 4px', letterSpacing: '1px' }}>
                        {data.affiliation_number ? `Affiliation No: ${data.affiliation_number}` : ''}
                    </p>
                    <h1 style={schoolNameStyle}>{data.school_name}</h1>
                    <p style={{ fontSize: '11px', color: '#4a5568', margin: '4px 0' }}>
                        {[data.school_address, data.school_city].filter(Boolean).join(', ')}
                    </p>
                    {data.school_phone && <p style={{ fontSize: '10px', color: '#718096', margin: '2px 0' }}>Ph: {data.school_phone} | Email: {data.school_email}</p>}
                    <h2 style={certTitleStyle}>Transfer Certificate</h2>
                    <p style={{ fontSize: '12px', color: '#4a5568', margin: 0 }}>
                        TC No: <strong>{data.certificate_number}</strong>
                    </p>
                </div>

                <div>
                    {fields.map(([label, value], i) => (
                        <div key={i} style={fieldRowStyle}>
                            <span style={{ ...labelStyle, minWidth: '40px', textAlign: 'right', paddingRight: '10px', color: '#718096' }}>{i + 1}.</span>
                            <span style={{ ...labelStyle, minWidth: '280px' }}>{label}</span>
                            <span style={valueStyle}>{value || ''}</span>
                        </div>
                    ))}
                </div>

                <p style={{ fontSize: '11px', color: '#4a5568', marginTop: '20px', fontStyle: 'italic', textAlign: 'center' }}>
                    Certified that the above information is in accordance with the School Register.
                </p>

                <div style={signatureStyle}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ borderTop: '1px solid #2d4a7a', paddingTop: '4px', minWidth: '120px' }}>Class Teacher</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ borderTop: '1px solid #2d4a7a', paddingTop: '4px', minWidth: '120px' }}>Checked By</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ borderTop: '1px solid #2d4a7a', paddingTop: '4px', minWidth: '120px' }}>
                            {data.principal_name || 'Principal'}
                        </div>
                    </div>
                </div>

                <div style={verifyStyle}>
                    Verification Code: {data.verification_code} | Verify at school portal | This is a computer-generated certificate
                </div>
            </div>
        </div>
    );
}

// ============================================================
// BONAFIDE CERTIFICATE
// ============================================================
export function BonafideCertificate({ data }: { data: CertificateData }) {
    const pronoun = data.gender === 'female' ? 'daughter' : 'son';
    const pronounHeShe = data.gender === 'female' ? 'She' : 'He';
    const pronounHisHer = data.gender === 'female' ? 'her' : 'his';

    return (
        <div style={{ ...borderStyle, width: '210mm', minHeight: '200mm', margin: '0 auto' }} className="print-certificate">
            <div style={{ ...innerBorderStyle, minHeight: '200mm' }}>
                <div style={headerStyle}>
                    {data.affiliation_number && <p style={{ fontSize: '11px', color: '#4a5568', margin: '0 0 4px', letterSpacing: '1px' }}>Affiliation No: {data.affiliation_number}</p>}
                    <h1 style={schoolNameStyle}>{data.school_name}</h1>
                    <p style={{ fontSize: '11px', color: '#4a5568', margin: '4px 0' }}>
                        {[data.school_address, data.school_city].filter(Boolean).join(', ')}
                    </p>
                    <h2 style={certTitleStyle}>Bonafide Certificate</h2>
                    <p style={{ fontSize: '12px', color: '#4a5568', margin: 0 }}>
                        Cert No: <strong>{data.certificate_number}</strong> &nbsp;|&nbsp; Date: <strong>{data.date}</strong>
                    </p>
                </div>

                <div style={{ fontSize: '14px', lineHeight: '2.2', fontFamily: "'Georgia', serif", color: '#2d3748', marginTop: '30px', textAlign: 'justify' }}>
                    <p style={{ textIndent: '40px' }}>
                        This is to certify that <strong style={{ color: '#1a365d', textDecoration: 'underline' }}>{data.student_name}</strong>,
                        {' '}{pronoun} of <strong>{data.father_name}</strong>,
                        is a bonafide student of this school.
                        {' '}{pronounHeShe} is studying in Class <strong>{data.class}{data.section ? ' - ' + data.section : ''}</strong> during
                        the academic year <strong>{data.academic_year}</strong>.
                    </p>
                    <p style={{ textIndent: '40px', marginTop: '10px' }}>
                        {pronounHeShe} bears Admission No. <strong>{data.admission_number}</strong> and
                        {' '}{pronounHisHer} date of birth as per our records is <strong>{data.date_of_birth}</strong>.
                    </p>
                    {data.purpose && (
                        <p style={{ textIndent: '40px', marginTop: '10px' }}>
                            This certificate is issued on {pronounHisHer} request for the purpose of <strong>{data.purpose}</strong>.
                        </p>
                    )}
                    <p style={{ textIndent: '40px', marginTop: '10px' }}>
                        {pronounHeShe} bears a good moral character and is well behaved.
                    </p>
                    <p style={{ textIndent: '40px', marginTop: '10px' }}>
                        I wish {pronounHisHer} all the best in {pronounHisHer} future endeavours.
                    </p>
                </div>

                <div style={signatureStyle}>
                    <div>
                        <p style={{ margin: 0, fontSize: '11px', color: '#718096' }}>Date: {data.date}</p>
                        <p style={{ margin: 0, fontSize: '11px', color: '#718096' }}>Place: {data.school_city}</p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ borderTop: '1px solid #2d4a7a', paddingTop: '4px', minWidth: '150px' }}>
                            {data.principal_name || 'Principal'}
                        </div>
                        <div style={{ fontSize: '10px', color: '#718096' }}>{data.school_name}</div>
                    </div>
                </div>

                <div style={verifyStyle}>
                    Verification Code: {data.verification_code} | This is a computer-generated certificate
                </div>
            </div>
        </div>
    );
}

// ============================================================
// CHARACTER CERTIFICATE
// ============================================================
export function CharacterCertificate({ data }: { data: CertificateData }) {
    const pronoun = data.gender === 'female' ? 'daughter' : 'son';
    const pronounHeShe = data.gender === 'female' ? 'She' : 'He';
    const pronounHisHer = data.gender === 'female' ? 'her' : 'his';

    return (
        <div style={{ ...borderStyle, width: '210mm', minHeight: '200mm', margin: '0 auto' }} className="print-certificate">
            <div style={{ ...innerBorderStyle, minHeight: '200mm' }}>
                <div style={headerStyle}>
                    {data.affiliation_number && <p style={{ fontSize: '11px', color: '#4a5568', margin: '0 0 4px' }}>Affiliation No: {data.affiliation_number}</p>}
                    <h1 style={schoolNameStyle}>{data.school_name}</h1>
                    <p style={{ fontSize: '11px', color: '#4a5568', margin: '4px 0' }}>
                        {[data.school_address, data.school_city].filter(Boolean).join(', ')}
                    </p>
                    <h2 style={certTitleStyle}>Character Certificate</h2>
                    <p style={{ fontSize: '12px', color: '#4a5568', margin: 0 }}>
                        Cert No: <strong>{data.certificate_number}</strong> &nbsp;|&nbsp; Date: <strong>{data.date}</strong>
                    </p>
                </div>

                <div style={{ fontSize: '14px', lineHeight: '2.2', fontFamily: "'Georgia', serif", color: '#2d3748', marginTop: '30px', textAlign: 'justify' }}>
                    <p style={{ textIndent: '40px' }}>
                        This is to certify that <strong style={{ color: '#1a365d', textDecoration: 'underline' }}>{data.student_name}</strong>,
                        {' '}{pronoun} of <strong>{data.father_name}</strong>,
                        was/is a student of this institution bearing Admission No. <strong>{data.admission_number}</strong>.
                    </p>
                    <p style={{ textIndent: '40px', marginTop: '10px' }}>
                        {pronounHeShe} studied in Class <strong>{data.class}{data.section ? ' - ' + data.section : ''}</strong> during
                        the session <strong>{data.academic_year}</strong>.
                    </p>
                    <p style={{ textIndent: '40px', marginTop: '10px' }}>
                        During {pronounHisHer} stay in this institution, {pronounHeShe} bore a <strong>good moral character</strong>.
                        {' '}{pronounHeShe} was regular, punctual, and obedient.
                        {' '}{pronounHeShe} has not been involved in any kind of indiscipline or undesirable activities.
                    </p>
                    <p style={{ textIndent: '40px', marginTop: '10px' }}>
                        I wish {pronounHisHer} all the best in {pronounHisHer} future endeavours.
                    </p>
                </div>

                <div style={signatureStyle}>
                    <div>
                        <p style={{ margin: 0, fontSize: '11px', color: '#718096' }}>Date: {data.date}</p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ borderTop: '1px solid #2d4a7a', paddingTop: '4px', minWidth: '150px' }}>
                            {data.principal_name || 'Principal'}
                        </div>
                        <div style={{ fontSize: '10px', color: '#718096' }}>{data.school_name}</div>
                    </div>
                </div>

                <div style={verifyStyle}>
                    Verification Code: {data.verification_code} | This is a computer-generated certificate
                </div>
            </div>
        </div>
    );
}

// ============================================================
// STUDY CERTIFICATE
// ============================================================
export function StudyCertificate({ data }: { data: CertificateData }) {
    const pronoun = data.gender === 'female' ? 'daughter' : 'son';
    const pronounHeShe = data.gender === 'female' ? 'She' : 'He';

    return (
        <div style={{ ...borderStyle, width: '210mm', minHeight: '200mm', margin: '0 auto' }} className="print-certificate">
            <div style={{ ...innerBorderStyle, minHeight: '200mm' }}>
                <div style={headerStyle}>
                    <h1 style={schoolNameStyle}>{data.school_name}</h1>
                    <p style={{ fontSize: '11px', color: '#4a5568', margin: '4px 0' }}>
                        {[data.school_address, data.school_city].filter(Boolean).join(', ')}
                    </p>
                    <h2 style={certTitleStyle}>Study Certificate</h2>
                    <p style={{ fontSize: '12px', color: '#4a5568', margin: 0 }}>
                        Cert No: <strong>{data.certificate_number}</strong> &nbsp;|&nbsp; Date: <strong>{data.date}</strong>
                    </p>
                </div>

                <div style={{ fontSize: '14px', lineHeight: '2.2', fontFamily: "'Georgia', serif", color: '#2d3748', marginTop: '30px', textAlign: 'justify' }}>
                    <p style={{ textIndent: '40px' }}>
                        This is to certify that <strong style={{ color: '#1a365d', textDecoration: 'underline' }}>{data.student_name}</strong>,
                        {' '}{pronoun} of <strong>{data.father_name}</strong>,
                        has studied in this institution from <strong>{data.admission_date || 'N/A'}</strong>.
                    </p>
                    <p style={{ textIndent: '40px', marginTop: '10px' }}>
                        {pronounHeShe} was enrolled with Admission No. <strong>{data.admission_number}</strong> and
                        studied in Class <strong>{data.class}{data.section ? ' - ' + data.section : ''}</strong> during
                        the academic session <strong>{data.academic_year}</strong>.
                    </p>
                    <p style={{ textIndent: '40px', marginTop: '10px' }}>
                        This certificate is issued on request for academic reference purposes.
                    </p>
                </div>

                <div style={signatureStyle}>
                    <div><p style={{ margin: 0, fontSize: '11px', color: '#718096' }}>Date: {data.date}</p></div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ borderTop: '1px solid #2d4a7a', paddingTop: '4px', minWidth: '150px' }}>{data.principal_name || 'Principal'}</div>
                    </div>
                </div>

                <div style={verifyStyle}>
                    Verification Code: {data.verification_code} | This is a computer-generated certificate
                </div>
            </div>
        </div>
    );
}

// ============================================================
// CONDUCT CERTIFICATE
// ============================================================
export function ConductCertificate({ data }: { data: CertificateData }) {
    const pronoun = data.gender === 'female' ? 'daughter' : 'son';
    const pronounHeShe = data.gender === 'female' ? 'She' : 'He';
    const pronounHisHer = data.gender === 'female' ? 'her' : 'his';

    return (
        <div style={{ ...borderStyle, width: '210mm', minHeight: '200mm', margin: '0 auto' }} className="print-certificate">
            <div style={{ ...innerBorderStyle, minHeight: '200mm' }}>
                <div style={headerStyle}>
                    <h1 style={schoolNameStyle}>{data.school_name}</h1>
                    <p style={{ fontSize: '11px', color: '#4a5568', margin: '4px 0' }}>
                        {[data.school_address, data.school_city].filter(Boolean).join(', ')}
                    </p>
                    <h2 style={certTitleStyle}>Conduct Certificate</h2>
                    <p style={{ fontSize: '12px', color: '#4a5568', margin: 0 }}>
                        Cert No: <strong>{data.certificate_number}</strong> &nbsp;|&nbsp; Date: <strong>{data.date}</strong>
                    </p>
                </div>

                <div style={{ fontSize: '14px', lineHeight: '2.2', fontFamily: "'Georgia', serif", color: '#2d3748', marginTop: '30px', textAlign: 'justify' }}>
                    <p style={{ textIndent: '40px' }}>
                        This is to certify that <strong style={{ color: '#1a365d', textDecoration: 'underline' }}>{data.student_name}</strong>,
                        {' '}{pronoun} of <strong>{data.father_name}</strong>,
                        bearing Admission No. <strong>{data.admission_number}</strong>,
                        is a student of Class <strong>{data.class}{data.section ? ' - ' + data.section : ''}</strong> of this school.
                    </p>
                    <p style={{ textIndent: '40px', marginTop: '10px' }}>
                        {pronounHeShe} is regular and punctual in attending classes. {pronounHisHer.charAt(0).toUpperCase() + pronounHisHer.slice(1)} conduct and
                        behaviour during the stay in this school has been <strong>{data.conduct || 'Good'}</strong>.
                    </p>
                    <p style={{ textIndent: '40px', marginTop: '10px' }}>
                        {pronounHeShe} has not been involved in any kind of ragging, indiscipline,
                        or activities detrimental to the school&apos;s reputation.
                    </p>
                </div>

                <div style={signatureStyle}>
                    <div><p style={{ margin: 0, fontSize: '11px', color: '#718096' }}>Date: {data.date}</p></div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ borderTop: '1px solid #2d4a7a', paddingTop: '4px', minWidth: '150px' }}>{data.principal_name || 'Principal'}</div>
                    </div>
                </div>

                <div style={verifyStyle}>
                    Verification Code: {data.verification_code} | This is a computer-generated certificate
                </div>
            </div>
        </div>
    );
}

// ============================================================
// RENDERER — Picks the right template by type
// ============================================================
export function CertificateRenderer({ type, data }: { type: string; data: CertificateData }) {
    switch (type) {
        case 'transfer_certificate': return <TransferCertificate data={data} />;
        case 'bonafide': return <BonafideCertificate data={data} />;
        case 'character': return <CharacterCertificate data={data} />;
        case 'study': return <StudyCertificate data={data} />;
        case 'conduct': return <ConductCertificate data={data} />;
        default: return <BonafideCertificate data={data} />;
    }
}
