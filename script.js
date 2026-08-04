import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Inisialisasi Supabase
const SUPABASE_URL = 'https://levjigmyjotdbkzbnjqn.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxldmppZ215am90ZGJremJuanFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMjI2ODIsImV4cCI6MjA5Nzc5ODY4Mn0.WJ15sTRRFnV645LpFxWCBKbuyeUsajtOJTC-hAVNTcw'; 
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper Connection Timeout
const TIMEOUT_MS = 7000;
const withTimeout = (promise) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Koneksi lambat. Coba lagi.')), TIMEOUT_MS))
]);

// Helper State
let toastTimeout;
let hideTimeout;
let currentUser = null;
let isHiddenAmount = false;
let inactivityTimeout;
let html5QrcodeScannerCek = null; 
let html5QrcodeScannerInput = null;
let listMasterRiwayat = []; 
let listDataWarga = []; // Master Data Warga Global
let isSearchableDropdownInitialized = false;

const INACTIVITY_TIME = 2 * 60 * 60 * 1000; // 2 Jam

let enteredPin = '';
const MAX_PIN_LENGTH = 4; 
let isAuthenticating = false;

let appMinimizeTime = 0;
const TIME_TOLERANCE_MS = 3000; 

// ==========================================
// UTILITY & TOAST LOGGER
// ==========================================

const logToScreen = (message, isError = false) => {
    const logger = document.getElementById('ui-logger');
    if (!logger) return;
    
    clearTimeout(toastTimeout);
    clearTimeout(hideTimeout);
    
    const iconClass = isError ? 'bx-error-circle' : 'bx-check-circle';
    const iconColor = isError ? 'var(--danger-color)' : 'var(--primary-color)';
    
    logger.innerHTML = `
        <i class='bx ${iconClass}' style='font-size: 1.4rem; color: ${iconColor}; flex-shrink: 0;'></i>
        <div style='line-height: 1.3;'>${message}</div>
    `;
    
    logger.className = ''; 
    if (isError) {
        logger.classList.add('toast-error');
    } else {
        logger.classList.add('toast-success');
    }
    
    setTimeout(() => {
        logger.classList.add('toast-show');
    }, 50);
    
    toastTimeout = setTimeout(() => {
        logger.classList.remove('toast-show');
        hideTimeout = setTimeout(() => {
            logger.classList.add('hidden');
        }, 400); 
    }, 3500);
};

const triggerHaptic = (pattern) => {
    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
};

const formatRupiahInput = (value) => {
    const clean = value.replace(/\D/g, "");
    if (!clean) return "";
    return parseInt(clean, 10).toLocaleString("id-ID");
};

const formatRupiahModal = (input) => {
    let value = input.value.replace(/\D/g, "");
    if (value) {
        input.value = parseInt(value, 10).toLocaleString('id-ID');
    } else {
        input.value = '';
    }
};

// Custom Alert Modal
const tampilkanNotifikasiKustom = ({ tipe, judul, pesan, denganInput, nilaiInput, onConfirm }) => {
    const modal = document.getElementById('custom-alert-modal');
    const box = document.getElementById('custom-alert-box');
    const iconEl = document.getElementById('alert-icon-container');
    const titleEl = document.getElementById('alert-title');
    const msgEl = document.getElementById('alert-message');
    const inputContainer = document.getElementById('alert-input-container');
    const inputField = document.getElementById('alert-custom-input');
    const btnCancel = document.getElementById('alert-btn-cancel');
    const btnConfirm = document.getElementById('alert-btn-confirm');

    if (!modal || !box) return;

    titleEl.textContent = judul;
    msgEl.innerHTML = pesan;
    inputField.oninput = () => formatRupiahModal(inputField);
    
    if (tipe === 'sukses') {
        iconEl.innerHTML = "<i class='bx bx-check-circle' style='color: #00e676;'></i>";
        btnConfirm.style.background = "#00e676";
        btnConfirm.style.color = "#070d1a";
    } else if (tipe === 'hapus') {
        iconEl.innerHTML = "<i class='bx bx-trash' style='color: #ff5252;'></i>";
        btnConfirm.style.background = "#ff5252";
        btnConfirm.style.color = "#fff";
    } else if (tipe === 'edit') {
        iconEl.innerHTML = "<i class='bx bx-edit-alt' style='color: #ffd700;'></i>";
        btnConfirm.style.background = "#ffd700";
        btnConfirm.style.color = "#070d1a";
    } else {
        iconEl.innerHTML = "<i class='bx bx-error-circle' style='color: #f59e0b;'></i>";
        btnConfirm.style.background = "#f59e0b";
        btnConfirm.style.color = "#fff";
    }

    if (denganInput) {
        inputContainer.style.display = 'block';
        inputField.value = nilaiInput ? nilaiInput.toLocaleString('id-ID') : '';
        setTimeout(() => inputField.focus(), 100);
    } else {
        inputContainer.style.display = 'none';
    }

    if (onConfirm) {
        btnCancel.style.display = 'block';
        btnCancel.onclick = () => { modal.style.display = 'none'; };
        btnConfirm.onclick = () => {
            modal.style.display = 'none';
            if (denganInput) {
                onConfirm(inputField.value);
            } else {
                onConfirm();
            }
        };
    } else {
        btnCancel.style.display = 'none';
        btnConfirm.onclick = () => { modal.style.display = 'none'; };
    }

    modal.style.display = 'flex';
    setTimeout(() => { box.style.transform = 'scale(1)'; }, 50);
};

// ==========================================
// NAVIGATION & VIEW CONTROLLER
// ==========================================

const refreshCurrentActiveViewData = () => {
    if (!currentUser) return;
    
    const activeView = document.querySelector('.view:not(.hidden)');
    if (!activeView) return;

    const activeId = activeView.id;
    
    if (activeId === 'view-home') {
        loadDashboardData();
    } else if (activeId === 'view-riwayat') {
        loadAllTransactions();
    } else if (activeId === 'view-admin') {
        const rekapBox = document.getElementById('container-rekap-data');
        if (rekapBox && !rekapBox.classList.contains('hidden')) {
            loadRekapDataGlobal();
        }
    } else if (activeId === 'view-status') {
        const searchInput = document.getElementById('search-warga');
        if (searchInput && searchInput.value.trim() && document.getElementById('status-result').innerHTML !== '') {
            document.getElementById('btn-search-warga').click();
        }
    }
};

const switchView = async (targetId) => {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const targetEl = document.getElementById(targetId);
    if (targetEl) targetEl.classList.remove('hidden');
    
    setTimeout(() => {
        document.querySelectorAll('.view').forEach(v => {
            if (!v.classList.contains('hidden')) v.classList.add('active');
            else v.classList.remove('active');
        });
    }, 10);

    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    const correspondNav = document.querySelector(`.nav-item[data-target="${targetId}"]`);
    if (correspondNav) correspondNav.classList.add('active');
    
    await stopCekScanner();
    await stopInputScanner();

    if (targetId === 'view-riwayat') {
        loadAllTransactions();
    } else if (targetId === 'view-home') {
        loadDashboardData();
    }
};

const setupAdminAccordion = () => {
    const sections = [
        { headerId: 'header-cek-saldo', cardId: 'card-cek-saldo-tanggal', arrowId: 'arrow-cek-saldo' },
        { headerId: 'header-warga-baru', cardId: 'card-warga-baru', arrowId: 'arrow-warga-baru' },
        { headerId: 'header-manajemen-pin', cardId: 'card-manajemen-pin', arrowId: 'arrow-manajemen-pin' },
        { headerId: 'btn-load-rekap', cardId: 'container-rekap-data', arrowId: 'arrow-rekap' },
        { headerId: 'header-qr-generator', cardId: 'card-qr-generator', arrowId: 'arrow-qr-generator' }
    ];

    sections.forEach(item => {
        const headerEl = document.getElementById(item.headerId);
        const cardEl = document.getElementById(item.cardId);
        const arrowEl = document.getElementById(item.arrowId);

        if (headerEl && cardEl) {
            headerEl.addEventListener('click', () => {
                const isCurrentlyHidden = cardEl.classList.contains('hidden');

                sections.forEach(otherItem => {
                    const otherCard = document.getElementById(otherItem.cardId);
                    const otherArrow = document.getElementById(otherItem.arrowId);
                    if (otherCard) otherCard.classList.add('hidden');
                    if (otherArrow) otherArrow.style.transform = 'rotate(0deg)';
                });

                if (isCurrentlyHidden) {
                    cardEl.classList.remove('hidden');
                    if (arrowEl) arrowEl.style.transform = 'rotate(180deg)';
                    
                    if (item.headerId === 'btn-load-rekap') {
                        loadRekapDataGlobal();
                    } else {
                        const rekapList = document.getElementById('admin-data-list');
                        if (rekapList) rekapList.innerHTML = "";
                    }

                    if (item.headerId === 'header-qr-generator') {
                        const selectQr = document.getElementById('select-warga-qr');
                        if (selectQr) selectQr.value = '';
                        const outContainer = document.getElementById('qr-output-container');
                        if (outContainer) {
                            outContainer.classList.add('hidden');
                            outContainer.style.display = 'none';
                        }
                        const canvas = document.getElementById('qrcode-canvas');
                        if (canvas) canvas.innerHTML = '';
                    }
                }
            });
        }
    });
};

// ==========================================
// SESSION & AUTHENTICATION (PIN)
// ==========================================

const updatePinVisual = () => {
    for (let i = 1; i <= MAX_PIN_LENGTH; i++) {
        const dot = document.getElementById(`dot-${i}`);
        if (dot) {
            if (i <= enteredPin.length) {
                dot.classList.add('filled');
            } else {
                dot.classList.remove('filled');
            }
        }
    }
};

const handlePinInput = async (num) => {
    if (isAuthenticating || enteredPin.length >= MAX_PIN_LENGTH) return;
    enteredPin += num;
    updatePinVisual();

    if (enteredPin.length === MAX_PIN_LENGTH) {
        isAuthenticating = true;
        logToScreen('Mengotentikasi PIN Berkas...');
        try {
            const { data, error } = await withTimeout(
                supabase.from('petugas').select('id, nama').eq('pin', enteredPin).single()
            );
            if (error || !data) throw new Error('PIN salah atau tidak terdaftar!');
            currentUser = data;
            localStorage.setItem('jimpitan_session', JSON.stringify(currentUser));
            logToScreen('Otentikasi Sukses!');
            setTimeout(() => {
                enteredPin = '';
                updatePinVisual();
                showMainApp();
                isAuthenticating = false;
            }, 500);
        } catch (err) {
            logToScreen(err.message, true);
            setTimeout(() => {
                enteredPin = '';
                updatePinVisual();
                isAuthenticating = false;
            }, 800);
        }
    }
};

const showMainApp = () => {
    document.getElementById('login-screen')?.classList.add('hidden');
    document.getElementById('main-screen')?.classList.remove('hidden');
    
    const nameEl = document.getElementById('user-name');
    if (nameEl) nameEl.textContent = currentUser.nama;
    
    const adminNav = document.getElementById('nav-admin');
    if (adminNav) {
        if (currentUser.nama === 'SUPER ADMIN') {
            adminNav.classList.remove('hidden');
        } else {
            adminNav.classList.add('hidden');
        }
    }

    loadDashboardData();
    loadWargaDropdown();
    loadPetugasDropdown();
    resetInactivityTimer();
};

const handleLogout = async (isAutomated = false) => {
    await stopCekScanner();
    await stopInputScanner();
    clearTimeout(inactivityTimeout);
    localStorage.removeItem('jimpitan_session');
    currentUser = null;
    enteredPin = ''; 
    updatePinVisual();
    switchView('view-home');
    
    document.getElementById('login-screen')?.classList.remove('hidden');
    document.getElementById('main-screen')?.classList.add('hidden');
    if (isAutomated) logToScreen('Aplikasi terkunci otomatis demi keamanan.', true);
};

const resetInactivityTimer = () => {
    clearTimeout(inactivityTimeout);
    if (currentUser) {
        inactivityTimeout = setTimeout(() => { handleLogout(true); }, INACTIVITY_TIME);
    }
};

// ==========================================
// SEARCHABLE DROPDOWN WARGA
// ==========================================

function setupSearchableDropdown(dataWarga) {
    if (dataWarga) {
        listDataWarga = dataWarga;
    }

    const searchInput = document.getElementById('input-search-warga');
    const dropdownList = document.getElementById('warga-dropdown-list');
    const hiddenInput = document.getElementById('select-warga');
    const container = document.getElementById('custom-warga-container');

    if (!searchInput || !dropdownList) return;

    const renderList = (items) => {
        dropdownList.innerHTML = '';

        if (items.length === 0) {
            dropdownList.innerHTML = `<li class="dropdown-no-result" style="padding: 10px; color: var(--text-muted); text-align: center;"><i class='bx bx-info-circle'></i> Nama warga tidak ditemukan</li>`;
            return;
        }

        items.forEach(warga => {
            const li = document.createElement('li');
            li.className = 'dropdown-item';
            const wargaId = warga.id !== undefined ? warga.id : warga.nama;
            const wargaNama = warga.nama || warga;

            li.setAttribute('data-value', wargaId);
            li.innerHTML = `<i class='bx bx-user'></i> <span>${wargaNama}</span>`;

            li.addEventListener('click', () => {
                if (searchInput) searchInput.value = wargaNama;
                if (hiddenInput) hiddenInput.value = wargaId;
                closeDropdown();
            });

            dropdownList.appendChild(li);
        });
    };

    const openDropdown = () => {
        if (container) container.classList.add('active');
        dropdownList.classList.remove('hidden');
    };

    const closeDropdown = () => {
        if (container) container.classList.remove('active');
        dropdownList.classList.add('hidden');
    };

    if (!isSearchableDropdownInitialized) {
        isSearchableDropdownInitialized = true;

        searchInput.addEventListener('focus', () => {
            renderList(listDataWarga);
            openDropdown();
        });

        searchInput.addEventListener('input', (e) => {
            const keyword = e.target.value.toLowerCase();
            if (hiddenInput) hiddenInput.value = ''; // Reset ID jika user mengetik manual
            const filtered = listDataWarga.filter(w => {
                const nama = (w.nama || w).toLowerCase();
                return nama.includes(keyword);
            });
            renderList(filtered);
            openDropdown();
        });

        document.addEventListener('click', (e) => {
            if (container && !container.contains(e.target)) {
                closeDropdown();
            }
        });
    }
}

// ==========================================
// QR CODE SCANNER CONTROLLERS
// ==========================================

const toggleInputScanner = async () => {
    const wrapper = document.getElementById('scanner-wrapper-input');
    const btn = document.getElementById('btn-toggle-scan-input');
    if (!wrapper || !btn) return;
    
    if (wrapper.classList.contains('hidden')) {
        await stopCekScanner(); 
        wrapper.classList.remove('hidden');
        btn.innerHTML = "<i class='bx bx-camera-off'></i> Tutup Kamera";
        
        try {
            html5QrcodeScannerInput = new Html5Qrcode("reader-input");
            await html5QrcodeScannerInput.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    triggerHaptic([100, 50, 100]);
                    const scannedName = decodedText.trim().toLowerCase();
                    const matched = listDataWarga.find(w => (w.nama || '').toLowerCase().includes(scannedName));

                    if (matched) {
                        const searchInput = document.getElementById('input-search-warga');
                        const hiddenInput = document.getElementById('select-warga');
                        if (searchInput) searchInput.value = matched.nama;
                        if (hiddenInput) hiddenInput.value = matched.id;
                        logToScreen(`Warga Terdeteksi: ${matched.nama}`);
                    } else {
                        logToScreen("Nama QR tidak ditemukan di daftar.", true);
                    }
                    stopInputScanner();
                },
                () => {}
            );
        } catch (err) {
            logToScreen("Gagal membuka kamera.", true);
            await stopInputScanner();
        }
    } else {
        await stopInputScanner();
    }
};

const stopInputScanner = async () => {
    const wrapper = document.getElementById('scanner-wrapper-input');
    const btn = document.getElementById('btn-toggle-scan-input');
    if (btn) btn.innerHTML = "<i class='bx bx-camera'></i> Scan QR Nama Warga";
    if (wrapper) wrapper.classList.add('hidden');
    
    if (html5QrcodeScannerInput) {
        try {
            await html5QrcodeScannerInput.stop();
        } catch (err) {
            console.error(err);
        } finally {
            html5QrcodeScannerInput = null;
        }
    }
};

const toggleCekScanner = async () => {
    const wrapper = document.getElementById('scanner-wrapper-cek');
    const btn = document.getElementById('btn-toggle-scan-cek');
    if (!wrapper || !btn) return;
    
    if (wrapper.classList.contains('hidden')) {
        await stopInputScanner(); 
        wrapper.classList.remove('hidden');
        btn.innerHTML = "<i class='bx bx-camera-off'></i> Tutup Kamera";
        
        try {
            html5QrcodeScannerCek = new Html5Qrcode("reader-cek");
            await html5QrcodeScannerCek.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    triggerHaptic([100, 50, 100]);
                    const searchWarga = document.getElementById('search-warga');
                    if (searchWarga) searchWarga.value = decodedText.trim();
                    logToScreen("QR Terbaca!");
                    stopCekScanner();
                    document.getElementById('btn-search-warga')?.click();
                },
                () => {}
            );
        } catch (err) {
            logToScreen("Gagal membuka kamera.", true);
            await stopCekScanner();
        }
    } else {
        await stopCekScanner();
    }
};

const stopCekScanner = async () => {
    const wrapper = document.getElementById('scanner-wrapper-cek');
    const btn = document.getElementById('btn-toggle-scan-cek');
    if (btn) btn.innerHTML = "<i class='bx bx-camera'></i> Scan Nama Warga";
    if (wrapper) wrapper.classList.add('hidden');
    
    if (html5QrcodeScannerCek) {
        try {
            await html5QrcodeScannerCek.stop();
        } catch (err) {
            console.error(err);
        } finally {
            html5QrcodeScannerCek = null;
        }
    }
};

// ==========================================
// BUSINESS LOGIC & SUPABASE QUERIES
// ==========================================

const handleHitungSaldoTanggal = async () => {
    const tglAwal = document.getElementById('filter-tgl-awal').value;
    const tglAkhir = document.getElementById('filter-tgl-akhir').value;
    const boxHasil = document.getElementById('hasil-kalkulasi-saldo');
    const txtSaldo = document.getElementById('txt-saldo-terfilter');

    if (!tglAwal || !tglAkhir) {
        return logToScreen('Pilih tanggal awal dan akhir terlebih dahulu!', true);
    }

    const btn = document.getElementById('btn-hitung-saldo');
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Menghitung...";
        }

        const { data, error } = await withTimeout(
            supabase.from('mutasi')
                    .select('nominal')
                    .gte('tanggal', `${tglAwal}T00:00:00`)
                    .lte('tanggal', `${tglAkhir}T23:59:59`)
        );

        if (error) throw error;
        const totalSaldo = data.reduce((sum, item) => sum + (item.nominal || 0), 0);
        
        if (txtSaldo) txtSaldo.textContent = `Rp ${totalSaldo.toLocaleString('id-ID')}`;
        if (boxHasil) boxHasil.style.display = 'block';
        logToScreen('Kalkulasi saldo berhasil diperbarui!');
    } catch (err) {
        logToScreen('Gagal memproses data filter saldo.', true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = "<i class='bx bx-calculator'></i> Hitung Total";
        }
    }
};

const handleTambahWargaBaru = async () => {
    const namaInput = document.getElementById('input-nama-warga-baru');
    const namaWarga = namaInput ? namaInput.value.trim() : '';

    if (!namaWarga) return logToScreen('Nama warga baru tidak boleh kosong!', true);

    const btn = document.getElementById('btn-submit-warga-baru');
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Mendaftarkan...";
        }

        const { error } = await withTimeout(supabase.from('warga').insert([{ nama: namaWarga }]));
        if (error) throw error;

        logToScreen(`Sukses mendaftarkan ${namaWarga}!`);
        if (namaInput) namaInput.value = ''; 
        await loadWargaDropdown();
        
        const rekapBox = document.getElementById('container-rekap-data');
        if (rekapBox && !rekapBox.classList.contains('hidden')) {
            loadRekapDataGlobal();
        }
    } catch (err) {
        logToScreen('Gagal mendaftarkan warga.', true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = "<i class='bx bx-user-plus'></i> Simpan Warga";
        }
    }
};

const loadPetugasDropdown = async () => {
    try {
        const { data, error } = await withTimeout(supabase.from('petugas').select('id, nama').order('nama'));
        if (error) throw error;
        const select = document.getElementById('select-petugas-pin');
        if (!select) return;
        
        select.innerHTML = '<option value="">-- Petugas Baru (Ketik Manual) --</option>';
        data.forEach(p => {
            if (p.nama !== 'SUPER ADMIN') {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.nama;
                select.appendChild(opt);
            }
        });
    } catch (err) {
        console.error('Gagal memuat daftar petugas:', err);
    }
};

const handleSimpanPinPetugas = async () => {
    const petugasId = document.getElementById('select-petugas-pin').value;
    const namaPetugas = document.getElementById('input-nama-petugas').value.trim();
    const pinBaru = document.getElementById('input-pin-petugas').value.trim();

    if (!namaPetugas || !pinBaru) {
        return logToScreen('Nama petugas dan PIN tidak boleh kosong!', true);
    }
    if (pinBaru.length !== 4) {
        return logToScreen('PIN harus tepat berukuran 4 digit angka!', true);
    }

    const btn = document.getElementById('btn-submit-pin');
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Menyimpan Berkas...";
        }

        if (petugasId) {
            const { error } = await withTimeout(
                supabase.from('petugas').update({ pin: pinBaru }).eq('id', parseInt(petugasId, 10))
            );
            if (error) throw error;
            logToScreen(`Sukses memperbarui PIN untuk petugas ${namaPetugas}!`);
        } else {
            const { error } = await withTimeout(
                supabase.from('petugas').insert([{ nama: namaPetugas, pin: pinBaru }])
            );
            if (error) throw error;
            logToScreen(`Sukses mendaftarkan petugas baru: ${namaPetugas}!`);
        }

        document.getElementById('select-petugas-pin').value = "";
        const inputNama = document.getElementById('input-nama-petugas');
        inputNama.value = "";
        inputNama.disabled = false;
        document.getElementById('input-pin-petugas').value = "";
        
        await loadPetugasDropdown();
    } catch (err) {
        logToScreen('Gagal menyimpan otentikasi PIN baru.', true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = "<i class='bx bx-save'></i> Simpan PIN";
        }
    }
};

window.deleteTransaksiPermanen = (id, namaWarga) => {
    tampilkanNotifikasiKustom({
        tipe: 'hapus',
        judul: 'Hapus Transaksi?',
        pesan: `Apakah Anda yakin ingin menghapus data riwayat milik <strong>${namaWarga}</strong> secara permanen dari database?`,
        denganInput: false,
        onConfirm: async () => {
            try {
                logToScreen('Menghapus berkas permanen...');
                const { error } = await withTimeout(supabase.from('mutasi').delete().eq('id', id));
                if (error) throw error;

                tampilkanNotifikasiKustom({
                    tipe: 'sukses',
                    judul: 'Data Dihapus',
                    pesan: `Riwayat transaksi milik <strong>${namaWarga}</strong> telah dibersihkan dari sistem.`
                });
                loadDashboardData();
                loadAllTransactions();
            } catch (err) {
                logToScreen('Gagal menghapus permanen.', true);
            }
        }
    });
};

window.editTransaksiLangsung = (id, namaWarga, nominalLama) => {
    tampilkanNotifikasiKustom({
        tipe: 'edit',
        judul: 'Koreksi Transaksi',
        pesan: `Mengubah nominal kas milik <strong>${namaWarga}</strong>. Masukkan nominal rupiah baru:`,
        denganInput: true,
        nilaiInput: nominalLama,
        onConfirm: async (hasilInput) => {
            const nominalBaru = parseInt(hasilInput.replace(/\D/g, ''), 10);
            if (isNaN(nominalBaru) || nominalBaru <= 0) {
                tampilkanNotifikasiKustom({
                    tipe: 'gagal',
                    judul: 'Koreksi Gagal',
                    pesan: 'Nominal saldo yang Anda masukkan tidak valid!'
                });
                return;
            }

            try {
                logToScreen('Menyimpan perubahan...');
                const { error } = await withTimeout(supabase.from('mutasi').update({ nominal: nominalBaru }).eq('id', id));
                if (error) throw error;

                tampilkanNotifikasiKustom({
                    tipe: 'sukses',
                    judul: 'Berhasil Disimpan',
                    pesan: `Nominal transaksi ${namaWarga} diperbarui menjadi <strong>Rp ${nominalBaru.toLocaleString('id-ID')}</strong>`
                });
                loadDashboardData();
                loadAllTransactions();
            } catch (err) {
                logToScreen('Gagal memperbarui nilai transaksi.', true);
            }
        }
    });
};

const loadDashboardData = async () => {
    const ledEl = document.getElementById('srv-led');
    const ledTxt = document.getElementById('srv-text');

    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        
        const { data, error } = await withTimeout(
            supabase.from('mutasi').select('nominal, warga(nama)').gte('tanggal', startOfDay)
        );
        
        if (error) throw error;

        if (ledEl && ledTxt) {
            ledEl.className = "led-indicator led-online";
            ledTxt.className = "led-status-text text-online";
            ledTxt.textContent = "Online";
        }

        const total = data.reduce((sum, row) => sum + row.nominal, 0);
        const amountEl = document.getElementById('total-amount');
        if (amountEl) {
            const formattedTotal = `Rp ${total.toLocaleString('id-ID')}`;
            if (isHiddenAmount) amountEl.dataset.real = formattedTotal;
            else amountEl.textContent = formattedTotal;
        }
        
        const listEl = document.getElementById('transaction-list');
        if (listEl) {
            listEl.innerHTML = '';
            if (data.length === 0) {
                listEl.innerHTML = '<li style="color: var(--text-muted); justify-content:center;">Belum ada mutasi masuk hari ini</li>';
            } else {
                data.slice(-5).reverse().forEach(trx => {
                    const li = document.createElement('li');
                    const namaWarga = trx.warga ? trx.warga.nama : 'Unknown';
                    li.innerHTML = `<span>${namaWarga}</span> <strong>+ Rp ${trx.nominal.toLocaleString('id-ID')}</strong>`;
                    listEl.appendChild(li);
                });
            }
        }
    } catch (err) {
        if (ledEl && ledTxt) {
            ledEl.className = "led-indicator led-offline";
            ledTxt.className = "led-status-text text-offline";
            ledTxt.textContent = "Offline";
        }
        logToScreen('Gagal memuat mutasi harian / Masalah Jaringan.', true);
    }
};

const loadWargaDropdown = async () => {
    try {
        const { data, error } = await withTimeout(supabase.from('warga').select('id, nama').order('nama'));
        if (error) throw error;
        
        listDataWarga = data || [];
        
        // 1. Inisialisasi Searchable Dropdown untuk Input Setoran
        setupSearchableDropdown(listDataWarga);
        
        // 2. Isi Dropdown standar untuk QR Generator Admin
        const selectQr = document.getElementById('select-warga-qr');
        if (selectQr) {
            selectQr.innerHTML = '<option value="">-- Pilih Nama Warga --</option>';
            listDataWarga.forEach(w => {
                const optQr = document.createElement('option');
                optQr.value = w.nama;
                optQr.textContent = w.nama;
                selectQr.appendChild(optQr);
            });
        }
    } catch (err) {
        logToScreen('Gagal sinkronisasi data warga', true);
    }
};

// Modul Pembuat QR Code Warga
const handleGenerateQRCode = () => {
    if (typeof QRCode === 'undefined') {
        return logToScreen('Library QRCode belum dimuat!', true);
    }

    const selectQr = document.getElementById('select-warga-qr');
    const namaWargaSelected = selectQr ? selectQr.value : '';
    const qrCanvasDiv = document.getElementById('qrcode-canvas');
    const container = document.getElementById('qr-output-container');

    if (!namaWargaSelected) {
        return logToScreen('Silakan pilih nama warga terlebih dahulu!', true);
    }

    triggerHaptic(40);
    if (qrCanvasDiv) qrCanvasDiv.innerHTML = "";
    
    if (container) {
        container.classList.remove('hidden');
        container.style.display = 'flex';
    }

    new QRCode(qrCanvasDiv, {
        text: namaWargaSelected,
        width: 180,
        height: 180,
        colorDark : "#0b1528",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    logToScreen(`QR Code untuk ${namaWargaSelected} berhasil dibuat!`);
};

const handleDownloadQRCode = () => {
    const qrCanvasDiv = document.getElementById('qrcode-canvas');
    const img = qrCanvasDiv ? qrCanvasDiv.querySelector('img') : null;
    const selectQr = document.getElementById('select-warga-qr');
    const namaWargaSelected = selectQr && selectQr.value ? selectQr.value.replace(/\s+/g, '_') : 'Warga';

    if (img && img.src) {
        triggerHaptic(40);
        const link = document.createElement('a');
        link.href = img.src;
        link.download = `QR_Kartu_${namaWargaSelected}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        logToScreen('Gambar QR Kartu berhasil diunduh!');
    } else {
        logToScreen('Gagal mengekspor berkas gambar.', true);
    }
};

const loadAllTransactions = async () => {
    const listEl = document.getElementById('global-history-list');
    if (!listEl) return;

    listEl.innerHTML = `
        <div class="skeleton skel-card"></div>
        <div class="skeleton skel-card"></div>
        <div class="skeleton skel-card"></div>
    `;
    const filterInput = document.getElementById('filter-riwayat-nama');
    if (filterInput) filterInput.value = '';

    try {
        const { data, error } = await withTimeout(
            supabase.from('mutasi').select('id, tanggal, nominal, petugas_nama, warga(nama)').order('tanggal', { ascending: false }).order('id', { ascending: false })
        );
        if (error) throw error;
        listMasterRiwayat = data; 
        renderRiwayatList();
    } catch (err) {
        listEl.innerHTML = '<li style="color: var(--danger-color); justify-content: center; padding: 15px;">Gagal mengunduh berkas riwayat.</li>';
    }
};

const renderRiwayatList = (filterKeyword = '') => {
    const listEl = document.getElementById('global-history-list');
    const balanceContainer = document.getElementById('admin-global-balance');
    const balanceAmountEl = document.getElementById('global-balance-amount');
    if (!listEl) return;

    listEl.innerHTML = '';
    const isSuperAdmin = (currentUser && currentUser.nama === 'SUPER ADMIN');

    if (isSuperAdmin && listMasterRiwayat.length > 0 && balanceContainer && balanceAmountEl) {
        const totalGlobal = listMasterRiwayat.reduce((sum, trx) => sum + (trx.nominal || 0), 0);
        balanceAmountEl.textContent = `Rp ${totalGlobal.toLocaleString('id-ID')}`;
        balanceContainer.classList.remove('hidden');
    } else if (balanceContainer) {
        balanceContainer.classList.add('hidden');
    }

    const filteredData = listMasterRiwayat.filter(trx => {
        const namaWarga = trx.warga ? trx.warga.nama.toLowerCase() : 'unknown';
        return namaWarga.includes(filterKeyword.toLowerCase());
    });

    if (filteredData.length === 0) {
        listEl.innerHTML = `
            <div style="text-align: center; padding: 30px 15px; color: var(--text-muted); background: var(--panel-bg); border-radius: 16px; border: 1px solid var(--glass-border);">
                <i class='bx bx-receipt' style='font-size: 2.5rem; color: rgba(255,255,255,0.1); margin-bottom: 10px; display: block;'></i>
                <span style="font-size: 0.9rem; font-weight: 500;">Tidak ada riwayat transaksi ditemukan</span>
            </div>
        `;
        return;
    }

    let lastGroupDate = "";
    const hariIniStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

    filteredData.forEach(trx => {
        const dateObj = new Date(trx.tanggal);
        const groupDateStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        
        if (groupDateStr !== lastGroupDate) {
            lastGroupDate = groupDateStr;
            const dateHeader = document.createElement('div');
            dateHeader.className = 'history-title';
            dateHeader.style.margin = '20px 0 10px 4px';
            dateHeader.style.fontSize = '0.78rem';
            dateHeader.style.color = 'var(--gold-accent)';
            dateHeader.style.letterSpacing = '0.8px';
            dateHeader.innerHTML = `<i class='bx bx-calendar-event' style='vertical-align: middle; margin-right: 4px;'></i> ${groupDateStr === hariIniStr ? 'HARI INI - ' : ''}${groupDateStr.toUpperCase()}`;
            listEl.appendChild(dateHeader);
        }

        const namaWarga = trx.warga ? trx.warga.nama : 'Unknown';
        const namaPetugas = trx.petugas_nama || 'Petugas';
        
        const li = document.createElement('li');
        li.style.display = 'flex'; 
        li.style.flexDirection = 'column'; 
        li.style.gap = '10px';
        li.style.padding = '14px 16px'; 
        li.style.marginBottom = '8px';
        li.style.borderRadius = '14px'; 
        li.style.background = 'var(--panel-bg)';
        li.style.border = '1px solid var(--glass-border)';
        
        let rowAtasHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <span style="font-weight: 600; color: var(--text-main); font-size: 0.95rem; letter-spacing: 0.3px;">${namaWarga}</span>
                    <div style="display: flex; align-items: center; color: var(--text-muted); font-size: 0.72rem;">
                        <span style="background: rgba(255,255,255,0.04); padding: 1px 5px; border-radius: 4px; border: 1px solid var(--glass-border); color: var(--text-main); font-size: 0.68rem;"><i class='bx bx-user-voice' style='font-size:0.75rem; vertical-align: middle;'></i> ${namaPetugas}</span>
                    </div>
                </div>
                <strong style="color: var(--primary-color); font-size: 1.05rem; font-weight: 700;">+ Rp ${trx.nominal.toLocaleString('id-ID')}</strong>
            </div>
        `;

        let rowBawahHTML = '';
        if (isSuperAdmin) {
            const namaWargaAman = namaWarga.replace(/'/g, "\\'");
            rowBawahHTML = `
                <div style="display: flex; gap: 8px; width: 100%; border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 8px; margin-top: 2px;">
                    <button onclick="editTransaksiLangsung(${trx.id}, '${namaWargaAman}', ${trx.nominal})" style="flex: 1; background: rgba(255,215,0,0.08); color: #ffd700; padding: 8px; border-radius: 8px; font-size: 0.8rem; font-weight:600; display:flex; align-items:center; justify-content:center; gap:4px; border: 1px solid rgba(255,215,0,0.15); cursor: pointer;"><i class='bx bx-edit-alt'></i> Koreksi</button>
                    <button onclick="deleteTransaksiPermanen(${trx.id}, '${namaWargaAman}')" style="flex: 1; background: rgba(255,82,82,0.08); color: var(--danger-color); padding: 8px; border-radius: 8px; font-size: 0.8rem; font-weight:600; display:flex; align-items:center; justify-content:center; gap:4px; border: 1px solid rgba(255,82,82,0.15); cursor: pointer;"><i class='bx bx-trash'></i> Hapus</button>
                </div>
            `;
        }
        
        li.innerHTML = rowAtasHTML + rowBawahHTML;
        listEl.appendChild(li);
    });
};

const loadRekapDataGlobal = async () => {
    const container = document.getElementById('admin-data-list');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center; color: var(--text-muted); padding: 15px;"><i class="bx bx-loader-alt bx-spin"></i> Menghimpun seluruh data konsolidasi...</p>';
    try {
        const { data, error } = await withTimeout(supabase.from('rekap_jimpitan').select('*').order('nama'));
        if (error) throw error;
        container.innerHTML = '';
        data.forEach(w => {
            const div = document.createElement('div');
            div.style.padding = '14px 10px'; 
            div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <span style="font-size:0.9rem; font-weight:500; color: var(--text-main);">${w.nama}</span>
                    <strong style="font-size:0.85rem; color: ${w.status === 'LUNAS' ? 'var(--primary-color)' : 'var(--danger-color)'}">${w.status}</strong>
                </div>
                <div style="color: var(--text-muted); display:flex; justify-content:space-between; font-size:0.8rem;">
                    <span>Saldo Akhir: Rp ${w.saldo_akhir.toLocaleString('id-ID')}</span>
                    ${w.hari_menunggak > 0 ? `<span style="color:var(--danger-color); font-weight:600;">-${w.hari_menunggak} Hari</span>` : ''}
                </div>
            `;
            container.appendChild(div);
        });
    } catch (err) {
        container.innerHTML = '<p style="text-align:center; color: var(--danger-color); padding:15px;">Gagal mengambil data rekap.</p>';
    }
};

// ==========================================
// EXPORT DATA (CSV, EXCEL, PDF)
// ==========================================

const fetchMutasiForExport = async () => {
    if (!currentUser || currentUser.nama !== 'SUPER ADMIN') {
        logToScreen('Akses Ditolak! Anda bukan Super Admin.', true);
        return null;
    }
    logToScreen('Menyiapkan data dokumen mutasi...');
    const { data, error } = await supabase
        .from('mutasi')
        .select('tanggal, nominal, petugas_nama, warga(nama)')
        .order('tanggal', { ascending: false });

    if (error) {
        logToScreen('Gagal mengambil data mutasi untuk export', true);
        return null;
    }
    return data;
};

// ==========================================
// INITIALIZATION & EVENT LISTENERS
// ==========================================

const initUI = () => {
    // Splash Screen Manager
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('fade-out');
            setTimeout(() => splash.remove(), 600);
        }
    }, 2500);

    // Theme Toggle
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    
    if (themeToggleBtn) {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            document.body.classList.add('light-theme');
            if (themeIcon) themeIcon.className = "bx bx-moon";
        }

        themeToggleBtn.addEventListener('click', () => {
            triggerHaptic(40);
            document.body.classList.toggle('light-theme');
            
            let theme = 'dark';
            if (document.body.classList.contains('light-theme')) {
                theme = 'light';
                if (themeIcon) themeIcon.className = "bx bx-moon";
                logToScreen('Mode Terang diaktifkan');
            } else {
                if (themeIcon) themeIcon.className = "bx bx-sun";
                logToScreen('Mode Gelap diaktifkan');
            }
            localStorage.setItem('theme', theme);
            refreshCurrentActiveViewData();
        });
    }

    // Navigation Triggers
    document.querySelectorAll('.nav-trigger').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            if (targetId) switchView(targetId);
        });
    });

    // Formatting Inputs
    const nominalInput = document.getElementById('input-nominal');
    if (nominalInput) {
        nominalInput.addEventListener('input', (e) => {
            e.target.value = formatRupiahInput(e.target.value);
        });
    }

    // Balance Hide/Show Eye Toggle
    const toggleEye = document.getElementById('toggle-eye');
    if (toggleEye) {
        toggleEye.addEventListener('click', (e) => {
            isHiddenAmount = !isHiddenAmount;
            const icon = e.currentTarget.querySelector('i');
            const amountEl = document.getElementById('total-amount');
            if (isHiddenAmount) {
                if (icon) icon.classList.replace('bx-hide', 'bx-show');
                if (amountEl) {
                    amountEl.dataset.real = amountEl.textContent;
                    amountEl.textContent = 'Rp •••••';
                }
            } else {
                if (icon) icon.classList.replace('bx-show', 'bx-hide');
                if (amountEl) {
                    amountEl.textContent = amountEl.dataset.real || 'Rp 0';
                }
            }
        });
    }

    // History Search Filter
    const filterRiwayat = document.getElementById('filter-riwayat-nama');
    if (filterRiwayat) {
        filterRiwayat.addEventListener('input', (e) => {
            renderRiwayatList(e.target.value.trim());
        });
    }

    // Action Buttons Binding
    document.getElementById('btn-refresh-riwayat')?.addEventListener('click', loadAllTransactions);
    document.getElementById('btn-hitung-saldo')?.addEventListener('click', handleHitungSaldoTanggal);
    document.getElementById('btn-submit-warga-baru')?.addEventListener('click', handleTambahWargaBaru);
    document.getElementById('btn-submit-pin')?.addEventListener('click', handleSimpanPinPetugas);
    document.getElementById('btn-generate-qr')?.addEventListener('click', handleGenerateQRCode);
    document.getElementById('btn-download-qr')?.addEventListener('click', handleDownloadQRCode);
    document.getElementById('btn-toggle-scan-input')?.addEventListener('click', toggleInputScanner);
    document.getElementById('btn-toggle-scan-cek')?.addEventListener('click', toggleCekScanner);

    // Dynamic Select Petugas Officer Handler
    document.getElementById('select-petugas-pin')?.addEventListener('change', (e) => {
        const inputNama = document.getElementById('input-nama-petugas');
        if (inputNama) {
            if (e.target.value !== "") {
                inputNama.value = e.target.options[e.target.selectedIndex].text;
                inputNama.disabled = true;
            } else {
                inputNama.value = "";
                inputNama.disabled = false;
            }
        }
    });

    // Sanitize PIN Input
    document.getElementById('input-pin-petugas')?.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, "");
    });

    // Default Date Picker (Hari Ini)
    const hariIni = new Date().toISOString().split('T')[0];
    const tglAwal = document.getElementById('filter-tgl-awal');
    const tglAkhir = document.getElementById('filter-tgl-akhir');
    if (tglAwal) tglAwal.value = hariIni;
    if (tglAkhir) tglAkhir.value = hariIni;

    // PIN Keypad Buttons
    document.querySelectorAll('.key-btn[data-num]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            triggerHaptic(40);
            handlePinInput(e.currentTarget.getAttribute('data-num'));
        });
    });
    
    document.getElementById('btn-clear')?.addEventListener('click', () => { triggerHaptic(40); enteredPin = ''; updatePinVisual(); });
    document.getElementById('btn-del')?.addEventListener('click', () => { triggerHaptic(40); enteredPin = enteredPin.slice(0, -1); updatePinVisual(); });
    document.getElementById('btn-logout')?.addEventListener('click', () => handleLogout(false));

    // Submit Setoran Jimpitan Form
    document.getElementById('btn-submit-jimpitan')?.addEventListener('click', async () => {
        const wargaId = document.getElementById('select-warga').value;
        const rawNominal = document.getElementById('input-nominal').value;
        const nominalClean = rawNominal.replace(/\D/g, "");

        if (!wargaId || !nominalClean) return logToScreen('Lengkapi parameter data setoran!', true);

        const btn = document.getElementById('btn-submit-jimpitan');
        try {
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Menyimpan Data...";
            }

            const { error } = await withTimeout(
                supabase.from('mutasi').insert([{ warga_id: parseInt(wargaId, 10), nominal: parseInt(nominalClean, 10), petugas_nama: currentUser.nama }])
            );
            if (error) throw error;

            logToScreen('Setoran Sukses Disimpan!');
            
            // Reset Form Input
            document.getElementById('select-warga').value = '';
            const searchInput = document.getElementById('input-search-warga');
            if (searchInput) searchInput.value = '';
            document.getElementById('input-nominal').value = '';

            await loadDashboardData(); 
            switchView('view-home');
        } catch (err) {
            logToScreen('Gagal mengeksekusi setoran.', true);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = "<i class='bx bx-save'></i> Simpan Data Setoran";
            }
        }
    });

    // Cek Status Warga Handler
    document.getElementById('btn-search-warga')?.addEventListener('click', async () => {
        const keyword = document.getElementById('search-warga').value.trim();
        const resultContainer = document.getElementById('status-result');
        if (!resultContainer) return;
        
        if (!keyword) return logToScreen('Masukkan atau scan nama warga terlebih dahulu!', true);
        resultContainer.innerHTML = '<p style="text-align:center; color: var(--text-muted); padding: 15px;"><i class=\'bx bx-loader-alt bx-spin\'></i> Menghimpun data...</p>';
        
        try {
            const { data: rekapData, error: rekapError } = await withTimeout(supabase.from('rekap_jimpitan').select('*').ilike('nama', `%${keyword}%`));
            if (rekapError) throw rekapError;
            resultContainer.innerHTML = '';
            if (!rekapData || rekapData.length === 0) {
                resultContainer.innerHTML = '<p style="text-align:center; color:var(--danger-color); padding: 15px;">Warga tidak terdaftar.</p>';
                return;
            }

            const wargaInfo = rekapData[0];
            const isLunas = wargaInfo.status === 'LUNAS';

            const { data: mutasiData, error: mutasiError } = await withTimeout(
                supabase.from('mutasi').select('tanggal, nominal, petugas_nama, warga(nama)').eq('warga_id', wargaInfo.warga_id).order('tanggal', { ascending: false }).limit(5)
            );

            if (mutasiError) throw mutasiError;

            const divStatus = document.createElement('div');
            divStatus.className = `status-item ${isLunas ? 'status-lunas' : 'status-nunggak'}`;
            
            divStatus.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid var(--glass-border); padding-bottom:10px;">
                    <strong style="font-size: 1.15rem; color: var(--text-main); letter-spacing:0.3px;">${wargaInfo.nama}</strong>
                    <span class="badge ${isLunas ? 'bg-lunas' : 'bg-nunggak'}">${wargaInfo.status}</span>
                </div>
                <div style="display:flex; flex-direction:column;">
                    <div class="status-row">
                        <span class="status-label"><i class='bx bx-wallet' style='color:var(--gold-accent); font-size:1.05rem;'></i> Saldo Mengendap</span>
                        <span class="status-value" style="color:var(--primary-color);">Rp ${wargaInfo.saldo_akhir.toLocaleString('id-ID')}</span>
                    </div>
                    <div class="status-row">
                        <span class="status-label"><i class='bx bx-error-circle' style='color:${isLunas ? "var(--primary-color)" : "var(--danger-color)"}; font-size:1.05rem;'></i> Status Tunggakan</span>
                        <span class="status-value" style="color:${isLunas ? "var(--primary-color)" : "var(--danger-color)"}; font-weight:700;">
                            ${!isLunas ? `${wargaInfo.hari_menunggak} Hari` : 'Bebas Tunggakan'}
                        </span>
                    </div>
                </div>
            `;
            resultContainer.appendChild(divStatus);

            const historyTitle = document.createElement('h4');
            historyTitle.className = 'history-title';
            historyTitle.style.marginTop = '20px';
            historyTitle.innerHTML = `<i class='bx bx-time-five' style='vertical-align: middle; margin-right: 4px; color:var(--text-muted);'></i> Riwayat Setoran Terakhir`;
            resultContainer.appendChild(historyTitle);

            const ulHistory = document.createElement('ul');
            ulHistory.className = 'history-list';

            if (!mutasiData || mutasiData.length === 0) {
                ulHistory.innerHTML = '<li style="color: var(--text-muted); justify-content:center; font-size:0.85rem; padding: 15px 0;">Belum memiliki riwayat transaksi</li>';
            } else {
                mutasiData.forEach(trx => {
                    const dateObj = new Date(trx.tanggal);
                    const tglLokal = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                    const jamLokal = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute:'2-digit' }).replace('.', ':');
                    
                    const li = document.createElement('li');
                    li.style.padding = '12px 0';
                    li.innerHTML = `
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <p style="font-weight:700; color:var(--text-main); font-size:0.95rem;">+ Rp ${trx.nominal.toLocaleString('id-ID')}</p>
                            <small style="color:var(--text-muted); font-size:0.72rem; display:flex; align-items:center; gap:3px;">
                                <i class='bx bx-user' style='font-size:0.8rem;'></i> ${trx.petugas_nama || 'Petugas'}
                            </small>
                        </div>
                        <div style="text-align:right; display:flex; flex-direction:column; gap:2px;">
                            <span style="font-size:0.85rem; color:var(--text-main); font-weight:500;">${tglLokal}</span>
                            <span style="font-size:0.72rem; color:var(--text-muted);">${jamLokal} WIB</span>
                        </div>
                    `;
                    ulHistory.appendChild(li);
                });
            }
            resultContainer.appendChild(ulHistory);
        } catch (err) {
            resultContainer.innerHTML = '<p style="text-align:center; color:var(--danger-color); padding: 15px;">Terjadi kesalahan saat memproses data.</p>';
        }
    });

    // Export Data Event Listeners
    document.getElementById('btn-export-csv')?.addEventListener('click', async () => {
        triggerHaptic(40);
        const data = await fetchMutasiForExport();
        if (!data) return;

        let csvContent = "data:text/csv;charset=utf-8,No,Nama Warga,Tanggal,Jam,Nominal,Petugas\n";
        data.forEach((row, index) => {
            const dateObj = new Date(row.tanggal);
            const tgl = dateObj.toLocaleDateString('id-ID');
            const jam = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
            const namaWarga = row.warga ? row.warga.nama : 'Unknown';
            const petugas = row.petugas_nama || 'Petugas';
            
            csvContent += `${index + 1},"${namaWarga}","${tgl}","${jam} WIB",${row.nominal},"${petugas}"\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Log_Mutasi_Jimpitan_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        logToScreen('CSV Mutasi Berhasil Diunduh!');
    });

    document.getElementById('btn-export-excel')?.addEventListener('click', async () => {
        if (typeof XLSX === 'undefined') {
            return logToScreen('Library SheetJS (XLSX) belum dimuat!', true);
        }
        triggerHaptic(40);
        const data = await fetchMutasiForExport();
        if (!data) return;

        const worksheetData = data.map((item, index) => {
            const dateObj = new Date(item.tanggal);
            const tgl = dateObj.toLocaleDateString('id-ID');
            const jam = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
            return {
                "No": index + 1,
                "Nama Warga": item.warga ? item.warga.nama : 'Unknown',
                "Tanggal": tgl,
                "Jam": jam + ' WIB',
                "Nominal Setoran (Rp)": item.nominal,
                "Petugas Lapangan": item.petugas_nama || 'Petugas'
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Log Mutasi");
        
        XLSX.writeFile(workbook, `Log_Mutasi_Jimpitan_${new Date().toISOString().split('T')[0]}.xlsx`);
        logToScreen('Excel Mutasi Berhasil Diunduh!');
    });

    document.getElementById('btn-export-pdf')?.addEventListener('click', async () => {
        if (typeof window.jspdf === 'undefined') {
            return logToScreen('Library jsPDF belum dimuat!', true);
        }
        triggerHaptic(40);
        const data = await fetchMutasiForExport();
        if (!data) return;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(16);
        doc.text("Laporan Riwayat Mutasi Lengkap m-Jimpitan", 14, 20);
        doc.setFontSize(10);
        doc.text(`Total Record: ${data.length} Transaksi | Dicetak pada: ${new Date().toLocaleString('id-ID')}`, 14, 28);

        const tableColumn = ["No", "Nama Warga", "Tanggal", "Jam", "Nominal", "Petugas"];
        const tableRows = [];

        data.forEach((item, index) => {
            const dateObj = new Date(item.tanggal);
            const tgl = dateObj.toLocaleDateString('id-ID');
            const jam = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
            const namaWarga = item.warga ? item.warga.nama : 'Unknown';
            const petugas = item.petugas_nama || 'Petugas';

            const rowData = [
                index + 1,
                namaWarga,
                tgl,
                jam + ' WIB',
                `Rp ${item.nominal.toLocaleString('id-ID')}`,
                petugas
            ];
            tableRows.push(rowData);
        });

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 35,
            theme: 'striped',
            headStyles: { fillColor: [30, 60, 114] }
        });

        doc.save(`Laporan_Mutasi_Lengkap_${new Date().toISOString().split('T')[0]}.pdf`);
        logToScreen('PDF Mutasi Berhasil Diunduh!');
    });

    // Auto Session Lock Detection
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            appMinimizeTime = Date.now();
        } else {
            if (currentUser && appMinimizeTime > 0) {
                const timeElapsed = Date.now() - appMinimizeTime;
                if (timeElapsed > TIME_TOLERANCE_MS) {
                    handleLogout(true);
                } else {
                    refreshCurrentActiveViewData();
                }
            }
            appMinimizeTime = 0;
        }
    });

    // Reset Inactivity Timer Listeners
    ['click', 'touchstart', 'mousemove', 'keypress'].forEach(eventType => {
        document.addEventListener(eventType, resetInactivityTimer);
    });

    // Check Local Storage Session
    const sessionStr = localStorage.getItem('jimpitan_session');
    if (sessionStr) {
        currentUser = JSON.parse(sessionStr);
        showMainApp();
    }

    setupAdminAccordion();
};

document.addEventListener('DOMContentLoaded', initUI);
