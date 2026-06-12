const fs = require('fs');

const path = 'c:/Users/rajhr/OneDrive/Documents/Desktop/School-Management-System/src/app/manage/library/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Interfaces
content = content.replace(
    'interface Category { id: string; name: string; description: string; display_order: number; is_active: boolean; }',
    'interface Category { id: string; name: string; description: string; display_order: number; is_active: boolean; }\ninterface Vendor { id: string; name: string; contact_person: string; phone: string; }'
);

content = content.replace(
    'total_copies: number; available_copies: number; shelf_location: string;',
    'total_copies: number; available_copies: number; shelf_location: string;\n    vendor_id?: string; vendor_name?: string; purchase_price?: string; purchase_date?: string;'
);

// 2. Tab Type
content = content.replace(
    "type TabType = 'catalog' | 'circulation' | 'active_issues' | 'reservations' | 'fines' | 'reports' | 'settings';",
    "type TabType = 'catalog' | 'circulation' | 'active_issues' | 'reservations' | 'fines' | 'reports' | 'settings' | 'vendors';"
);

// 3. States
content = content.replace(
    'const [categories, setCategories] = useState<Category[]>([]);',
    'const [categories, setCategories] = useState<Category[]>([]);\n    const [vendors, setVendors] = useState<Vendor[]>([]);'
);

// Add modal states below editingCat
content = content.replace(
    "const [catForm, setCatForm] = useState({ name: '', description: '', displayOrder: '0' });",
    `const [catForm, setCatForm] = useState({ name: '', description: '', displayOrder: '0' });

    // Vendors Modal
    const [showVendorModal, setShowVendorModal] = useState(false);
    const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
    const [vendorForm, setVendorForm] = useState({ name: '', contactPerson: '', email: '', phone: '', address: '' });

    // Barcode Modal
    const [showBarcodeModal, setShowBarcodeModal] = useState(false);
    const [barcodeBook, setBarcodeBook] = useState<Book | null>(null);
    const [bookCopies, setBookCopies] = useState<any[]>([]);

    // Bulk Import Modal
    const [showImportModal, setShowImportModal] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);`
);

// Update bookForm
content = content.replace(
    "shelfLocation: '', accessionNumberPrefix: 'LB'",
    "shelfLocation: '', accessionNumberPrefix: 'LB', vendorId: '', purchasePrice: '', purchaseDate: ''"
);

// Add imports
content = content.replace(
    "import { BookOpen",
    "import Barcode from 'react-barcode';\nimport * as XLSX from 'xlsx';\nimport { BookOpen"
);

// 4. Fetch Vendors
content = content.replace(
    "const fetchCategories = useCallback(async () => {",
    `const fetchVendors = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/library/vendors', { headers: headers() });
            const data = await res.json();
            setVendors(data.vendors || []);
        } catch (err) { console.error(err); }
    }, [token, headers]);

    const fetchCategories = useCallback(async () => {`
);

// Add fetchVendors to useEffect
content = content.replace(
    "fetchCategories();",
    "fetchCategories();\n            fetchVendors();"
);
content = content.replace(
    "[user, fetchCategories, fetchSettings, fetchBooks]);",
    "[user, fetchCategories, fetchVendors, fetchSettings, fetchBooks]);"
);

// 5. Handlers
content = content.replace(
    "const saveCat = async () => {",
    `const saveVendor = async () => {
        setSaving(true); setError('');
        try {
            const method = editingVendor ? 'PUT' : 'POST';
            const body = { id: editingVendor?.id, ...vendorForm };
            const r = await fetch('/api/library/vendors', { method, headers: headers(), body: JSON.stringify(body) });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to save vendor');
            setSuccess('Vendor saved!');
            setShowVendorModal(false);
            fetchVendors();
        } catch (err: any) { setError(err.message); }
        setSaving(false);
    };

    const deleteVendor = async (id: string) => {
        if (!confirm('Delete this vendor?')) return;
        try {
            const r = await fetch(\`/api/library/vendors?id=\${id}\`, { method: 'DELETE', headers: headers() });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to delete');
            setSuccess('Vendor deleted!');
            fetchVendors();
        } catch (err: any) { alert(err.message); }
    };

    const openBarcodes = async (b: Book) => {
        setBarcodeBook(b);
        setShowBarcodeModal(true);
        setBookCopies([]);
        try {
            const r = await fetch(\`/api/library/books/\${b.id}/copies\`, { headers: headers() });
            const data = await r.json();
            setBookCopies(data.copies || []);
        } catch (e) { console.error(e); }
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSaving(true); setError('');
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(worksheet);

            const booksData = json.map((row: any) => ({
                title: row.Title || row.title,
                author: row.Author || row.author,
                isbn: row.ISBN || row.isbn,
                publisher: row.Publisher || row.publisher,
                edition: row.Edition || row.edition,
                publicationYear: row['Publication Year'] || row.publicationYear,
                totalCopies: row['Total Copies'] || row.totalCopies || 1,
                shelfLocation: row['Shelf Location'] || row.shelfLocation,
                accessionPrefix: row['Accession Prefix'] || row.accessionPrefix || 'LB',
                purchasePrice: row['Purchase Price'] || row.purchasePrice,
                purchaseDate: row['Purchase Date'] || row.purchaseDate,
            }));

            const r = await fetch('/api/library/bulk-import', {
                method: 'POST', headers: headers(),
                body: JSON.stringify({ books: booksData })
            });
            const resData = await r.json();
            if (!r.ok) throw new Error(resData.error || 'Import failed');
            setSuccess(\`Imported \${resData.importedCount} books successfully!\`);
            if (resData.errors?.length > 0) {
                console.error("Import Errors:", resData.errors);
                alert("Some rows failed to import. Check console.");
            }
            setShowImportModal(false);
            fetchBooks(1);
        } catch (err: any) { setError(err.message); }
        setSaving(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const saveCat = async () => {`
);

// 6. openAddBook / openEditBook updates
content = content.replace(
    "shelfLocation: '', accessionNumberPrefix: 'LB'",
    "shelfLocation: '', accessionNumberPrefix: 'LB', vendorId: '', purchasePrice: '', purchaseDate: ''"
);
content = content.replace(
    "accessionNumberPrefix: b.accession_number_prefix || 'LB'",
    "accessionNumberPrefix: b.accession_number_prefix || 'LB', vendorId: b.vendor_id || '', purchasePrice: b.purchase_price ? b.purchase_price.toString() : '', purchaseDate: b.purchase_date ? new Date(b.purchase_date).toISOString().split('T')[0] : ''"
);

// 7. Tabs Menu
content = content.replace(
    "{ key: 'reports', label: 'Reports', icon: <BarChart3 className=\"w-4 h-4\" /> },",
    "{ key: 'reports', label: 'Reports', icon: <BarChart3 className=\"w-4 h-4\" /> },\n        { key: 'vendors', label: 'Vendors', icon: <Globe className=\"w-4 h-4\" /> },"
);

// 8. Buttons in Header
content = content.replace(
    "<Button onClick={() => { setEditingCat(null); setCatForm({ name: '', description: '', displayOrder: '0' }); setError(''); setShowCatModal(true); }}\n                                        className=\"bg-white/10 hover:bg-white/20 text-white gap-2 h-10 border border-white/20\"><Tag className=\"w-4 h-4\" /> Category</Button>",
    `<Button onClick={() => { setEditingCat(null); setCatForm({ name: '', description: '', displayOrder: '0' }); setError(''); setShowCatModal(true); }}
                                        className="bg-white/10 hover:bg-white/20 text-white gap-2 h-10 border border-white/20"><Tag className="w-4 h-4" /> Category</Button>
                                    <Button onClick={() => setShowImportModal(true)} className="bg-white/10 hover:bg-white/20 text-white gap-2 h-10 border border-white/20"><BookCopy className="w-4 h-4" /> Bulk Import</Button>`
);

content = content.replace(
    "<div className=\"flex gap-1\">",
    `<div className="flex gap-1">
                                                            <button onClick={() => openBarcodes(b)} className="p-1.5 hover:bg-blue-50 rounded-lg" title="View Barcodes"><Hash className="w-3.5 h-3.5 text-blue-400" /></button>`
);

// 9. Add Vendors Tab UI right before SETTINGS TAB. I need to find something unique before settings tab.
const vendorsTabUI = `
                        {/* ===== VENDORS TAB ===== */}
                        {tab === 'vendors' && (
                            <div>
                                <div className="flex justify-between items-center mb-5">
                                    <h2 className="text-xl font-bold text-gray-900">Vendors</h2>
                                    <Button onClick={() => { setEditingVendor(null); setVendorForm({ name: '', contactPerson: '', email: '', phone: '', address: '' }); setShowVendorModal(true); }} className="bg-teal-600 hover:bg-teal-700 text-white"><Plus className="w-4 h-4 mr-2" /> Add Vendor</Button>
                                </div>
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-semibold">
                                            <tr><th className="p-4">Name</th><th className="p-4">Contact Person</th><th className="p-4">Phone</th><th className="p-4 text-right">Actions</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {vendors.map(v => (
                                                <tr key={v.id} className="hover:bg-gray-50">
                                                    <td className="p-4 font-medium text-gray-900">{v.name}</td>
                                                    <td className="p-4 text-gray-500">{v.contact_person || '-'}</td>
                                                    <td className="p-4 text-gray-500">{v.phone || '-'}</td>
                                                    <td className="p-4 flex justify-end gap-2">
                                                        <button onClick={() => { setEditingVendor(v); setVendorForm({ name: v.name, contactPerson: v.contact_person || '', email: (v as any).email || '', phone: v.phone || '', address: (v as any).address || '' }); setShowVendorModal(true); }} className="p-1.5 hover:bg-gray-200 rounded-lg"><Edit2 className="w-4 h-4 text-gray-500" /></button>
                                                        <button onClick={() => deleteVendor(v.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-red-500" /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
`;

content = content.replace(
    "{/* ===== SETTINGS TAB ===== */}",
    vendorsTabUI + "\n                        {/* ===== SETTINGS TAB ===== */}"
);

// 10. Modals
// Let's add the Vendors, Bulk Import and Barcode Modals at the end before closing tags.
// Since we have a LibModal for Add Book, we can append there.
const newModals = `
            {/* Vendor Modal */}
            <LibModal show={showVendorModal} onClose={() => setShowVendorModal(false)} title={editingVendor ? 'Edit Vendor' : 'Add Vendor'} error={error}
                footer={<><Button variant="outline" onClick={() => setShowVendorModal(false)}>Cancel</Button><Button onClick={saveVendor} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white">{saving ? 'Saving...' : 'Save'}</Button></>}
            >
                <div className="space-y-4">
                    <InputField label="Vendor Name" value={vendorForm.name} onChange={(v: string) => setVendorForm({ ...vendorForm, name: v })} required />
                    <div className="grid grid-cols-2 gap-4">
                        <InputField label="Contact Person" value={vendorForm.contactPerson} onChange={(v: string) => setVendorForm({ ...vendorForm, contactPerson: v })} />
                        <InputField label="Phone" value={vendorForm.phone} onChange={(v: string) => setVendorForm({ ...vendorForm, phone: v })} />
                    </div>
                    <InputField label="Email" type="email" value={vendorForm.email} onChange={(v: string) => setVendorForm({ ...vendorForm, email: v })} />
                    <InputField label="Address" value={vendorForm.address} onChange={(v: string) => setVendorForm({ ...vendorForm, address: v })} />
                </div>
            </LibModal>

            {/* Bulk Import Modal */}
            <LibModal show={showImportModal} onClose={() => setShowImportModal(false)} title="Bulk Import Books" error={error}
                footer={<><Button variant="outline" onClick={() => setShowImportModal(false)}>Cancel</Button><Button disabled={saving} onClick={() => fileInputRef.current?.click()} className="bg-teal-600 hover:bg-teal-700 text-white">{saving ? 'Importing...' : 'Select File & Import'}</Button></>}
            >
                <div className="space-y-4 text-sm text-gray-600">
                    <p>Upload an Excel (.xlsx) or CSV file with the following columns:</p>
                    <ul className="list-disc pl-5 text-gray-500 font-mono text-xs">
                        <li>Title (required)</li>
                        <li>Author</li>
                        <li>ISBN</li>
                        <li>Publisher</li>
                        <li>Edition</li>
                        <li>Publication Year</li>
                        <li>Total Copies</li>
                        <li>Shelf Location</li>
                        <li>Accession Prefix</li>
                        <li>Purchase Price</li>
                        <li>Purchase Date</li>
                    </ul>
                    <input type="file" accept=".xlsx,.xls,.csv" className="hidden" ref={fileInputRef} onChange={handleImportFile} />
                </div>
            </LibModal>

            {/* View Barcodes Modal */}
            <LibModal show={showBarcodeModal} onClose={() => setShowBarcodeModal(false)} title={\`Barcodes: \${barcodeBook?.title}\`} error={error}
                footer={<><Button variant="outline" onClick={() => setShowBarcodeModal(false)}>Close</Button><Button onClick={() => window.print()} className="bg-teal-600 hover:bg-teal-700 text-white"><BookCopy className="w-4 h-4 mr-2"/>Print Labels</Button></>}
            >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4" id="printable-barcodes">
                    {bookCopies.map(c => (
                        <div key={c.id} className="flex flex-col items-center justify-center p-4 bg-gray-50 border border-gray-200 rounded-xl">
                            <Barcode value={c.accession_number} width={1.5} height={40} fontSize={12} displayValue={true} background="transparent" />
                        </div>
                    ))}
                    {bookCopies.length === 0 && <p className="col-span-full text-center text-gray-400">Loading copies...</p>}
                </div>
                <style dangerouslySetInnerHTML={{__html: \`
                    @media print {
                        body * { visibility: hidden; }
                        #printable-barcodes, #printable-barcodes * { visibility: visible; }
                        #printable-barcodes { position: absolute; left: 0; top: 0; width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
                        .fixed { position: static !important; }
                    }
                \`}} />
            </LibModal>
`;

content = content.replace(
    "            {/* Add Book Modal */}",
    newModals + "\n            {/* Add Book Modal */}"
);

// 11. Add Vendor, Price, Date fields to Add Book form
const vendorFields = `
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="text-xs font-semibold text-gray-600 mb-1 block">Vendor</label>
                                <select value={bookForm.vendorId} onChange={e => setBookForm({...bookForm, vendorId: e.target.value})} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none">
                                    <option value="">Select Vendor...</option>
                                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                </select>
                            </div>
                            <InputField label="Purchase Price" type="number" placeholder="0.00" value={bookForm.purchasePrice} onChange={(v: string) => setBookForm({ ...bookForm, purchasePrice: v })} />
                            <InputField label="Purchase Date" type="date" value={bookForm.purchaseDate} onChange={(v: string) => setBookForm({ ...bookForm, purchaseDate: v })} />
                        </div>
`;

content = content.replace(
    /<InputField label="Shelf Location"([^>]+)\/>\s+<InputField label="Accession Prefix"([^>]+)\/>\s+<\/div>/,
    `<InputField label="Shelf Location"$1/>
                            <InputField label="Accession Prefix"$2/>
                        </div>` + "\n" + vendorFields
);


fs.writeFileSync(path, content, 'utf8');
console.log('Modifications applied successfully.');
