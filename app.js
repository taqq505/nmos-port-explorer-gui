// Configuration and State
const state = {
    isRunning: false,
    shouldStop: false,
    results: [],
    totalTasks: 0,
    completedTasks: 0
};

// NMOS API Configuration
const NMOS_APIS = [
    { path: 'node', name: 'Node IS-04' },
    { path: 'connection', name: 'Node IS-05' },
    { path: 'query', name: 'Registry IS-04 Query' },
    { path: 'registration', name: 'Registry IS-04 Registration' }
];

const NMOS_VERSIONS = ['', 'v1.0', 'v1.1', 'v1.2', 'v1.3'];
const TRAILING_SLASHES = [true, false];

// DOM Elements
const form = document.getElementById('explorerForm');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressInfo = document.getElementById('progressInfo');
const resultsSection = document.getElementById('resultsSection');
const resultsStats = document.getElementById('resultsStats');
const resultsContainer = document.getElementById('resultsContainer');
const defaultPortList = document.getElementById('portList').value;

// Port Tab Elements
const portTabs = document.querySelectorAll('.port-tab');
const portTabContents = document.querySelectorAll('.port-tab-content');

// Utility Functions
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parsePortList(listStr) {
    if (!listStr.trim()) return [];
    return listStr.split(',')
        .map(p => parseInt(p.trim()))
        .filter(p => !isNaN(p) && p > 0 && p <= 65535);
}

function mergePortList(existingList, extraPorts) {
    const existingPorts = parsePortList(existingList);
    const combined = new Set(existingPorts);
    extraPorts.forEach(p => combined.add(p));
    return Array.from(combined).sort((a, b) => a - b).join(',');
}

function parsePortRange(start, end) {
    if (!start || !end) return [];

    const startPort = parseInt(start);
    const endPort = parseInt(end);

    if (isNaN(startPort) || isNaN(endPort)) return [];
    if (startPort > endPort || startPort < 1 || endPort > 65535) return [];
    if (endPort - startPort + 1 > 10000) {
        alert('Port range exceeds maximum of 10000 ports');
        return [];
    }

    const ports = [];
    for (let i = startPort; i <= endPort; i++) {
        ports.push(i);
    }
    return ports;
}

function getPorts() {
    // Check which tab is active
    const activeTab = document.querySelector('.port-tab.active').dataset.tab;

    if (activeTab === 'list') {
        const listPorts = parsePortList(document.getElementById('portList').value);
        return listPorts.sort((a, b) => a - b);
    } else {
        const start = document.getElementById('portRangeStart').value;
        const end = document.getElementById('portRangeEnd').value;
        const rangePorts = parsePortRange(start, end);
        return rangePorts.sort((a, b) => a - b);
    }
}

function getBasePaths() {
    const basePathInput = document.getElementById('basePath').value.trim();
    if (!basePathInput) return [''];
    return basePathInput.split(',').map(p => p.trim());
}

function isLocalTarget(target) {
    const normalized = target.toLowerCase();
    if (normalized === 'localhost' || normalized.endsWith('.local')) return true;

    const parts = normalized.split('.');
    if (parts.length !== 4) return false;
    if (!parts.every(p => /^\d+$/.test(p))) return false;

    const [a, b] = parts.map(p => parseInt(p, 10));
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
}

function updatePortListFromResults() {
    if (state.results.length === 0) return;
    const discoveredPorts = Array.from(new Set(state.results.map(r => r.port)));
    const portListInput = document.getElementById('portList');
    const mergedList = mergePortList(portListInput.value, discoveredPorts);
    if (mergedList !== portListInput.value) {
        portListInput.value = mergedList;
    }
}

async function testEndpoint(url, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-store',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            try {
                const data = await response.json();
                return { status: 'READABLE_OK', data };
            } catch (e) {
                return { status: 'OPEN_NOT_NMOS', data: null };
            }
        } else {
            return { status: 'OPEN_NOT_NMOS', data: null };
        }
    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            return { status: 'UNREACHABLE', data: null };
        }

        if (error.message.includes('CORS') || error.message.includes('NetworkError')) {
            return { status: 'REACHABLE_CORS_BLOCKED', data: null };
        }

        return { status: 'UNREACHABLE', data: null };
    }
}

function analyzeNMOSResponse(data, apiPath) {
    if (!data) return null;

    const apiType = NMOS_APIS.find(api => apiPath.includes(api.path));
    let versions = [];

    if (Array.isArray(data)) {
        versions = data.filter(v => v.match(/v\d+\.\d+/));
    }

    return {
        apiType: apiType ? apiType.name : 'Unknown',
        versions: versions.length > 0 ? versions : ['detected']
    };
}

function determineNMOSProbability(results, port, protocol) {
    const portResults = results.filter(r => r.port === port && r.protocol === protocol);
    const corsResults = portResults.filter(r => r.status === 'REACHABLE_CORS_BLOCKED');
    const readableResults = portResults.filter(r => r.status === 'READABLE_OK');

    const otherPortResults = results.filter(r => r.port !== port && r.protocol === protocol);
    const otherHasNode = otherPortResults.some(r => r.url.includes('/node'));
    const otherHasConnection = otherPortResults.some(r => r.url.includes('/connection'));

    if (readableResults.length > 0) {
        const hasNode = readableResults.some(r => r.apiType && r.apiType.includes('Node IS-04'));
        const hasConnection = readableResults.some(r => r.apiType && r.apiType.includes('Node IS-05'));

        if (hasNode && hasConnection) return 'HIGH';
        if (hasNode || hasConnection) return 'MEDIUM';
        if (otherHasNode || otherHasConnection) return 'MEDIUM';
        return 'LOW';
    }

    if (corsResults.length > 0) {
        const hasNode = corsResults.some(r => r.url.includes('/node'));
        const hasConnection = corsResults.some(r => r.url.includes('/connection'));

        if (hasNode && hasConnection) return 'HIGH';
        if (hasNode || hasConnection) return 'MEDIUM';
        if (otherHasNode || otherHasConnection) return 'MEDIUM';
        return 'LOW';
    }

    if (otherHasNode || otherHasConnection) return 'MEDIUM';
    return '-';
}

async function explorePort(target, port, protocol, endpoint, basePaths, timeout, interval) {
    const portResults = [];

    for (const basePath of basePaths) {
        // First, check root endpoint to see if NMOS is present
        for (const api of NMOS_APIS) {
            if (state.shouldStop) return portResults;

            const rootUrl = `${protocol}://${target}:${port}${basePath}${endpoint}/${api.path}/`;
            const rootResult = await testEndpoint(rootUrl, timeout);

            state.completedTasks++;
            updateProgress();

            if (interval > 0) {
                await sleep(interval);
            }

            // If root endpoint responds, add to results
            if (rootResult.status === 'READABLE_OK' || rootResult.status === 'REACHABLE_CORS_BLOCKED') {
                const nmosInfo = analyzeNMOSResponse(rootResult.data, api.path);

                // Add root result
                portResults.push({
                    port,
                    protocol: protocol,
                    url: rootUrl,
                    status: rootResult.status,
                    apiType: nmosInfo ? nmosInfo.apiType : (rootResult.status === 'REACHABLE_CORS_BLOCKED' ? api.name : null),
                    versions: nmosInfo ? nmosInfo.versions : ['root'],
                    basePath: basePath || '/',
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    return portResults;
}

function updateProgress() {
    const percent = state.totalTasks > 0 ? Math.round((state.completedTasks / state.totalTasks) * 100) : 0;
    progressFill.style.width = percent + '%';
    progressFill.textContent = percent + '%';
    progressInfo.textContent = `Completed ${state.completedTasks} / ${state.totalTasks} checks`;
}

function renderResults() {
    if (state.results.length === 0) {
        resultsContainer.innerHTML = '<div class="no-results"><p>No NMOS endpoints discovered.</p></div>';
        resultsStats.textContent = '0 results';
        return;
    }

    const groupedResults = {};
    state.results.forEach(result => {
        const key = `${result.port}-${result.protocol}`;
        if (!groupedResults[key]) {
            groupedResults[key] = [];
        }
        groupedResults[key].push(result);
    });

    let html = '<table><thead><tr>';
    html += '<th>Port</th>';
    html += '<th>Protocol</th>';
    html += '<th>API Type</th>';
    html += '<th>Version</th>';
    html += '<th>Status</th>';
    html += '<th>NMOS Probability</th>';
    html += '<th>Links</th>';
    html += '</tr></thead><tbody>';

    Object.entries(groupedResults).forEach(([key, results]) => {
        const first = results[0];
        const probability = determineNMOSProbability(state.results, first.port, first.protocol);

        results.forEach((result, idx) => {
            html += `<tr data-group="${key}">`;

            if (idx === 0) {
                html += `<td rowspan="${results.length}" data-group="${key}">${result.port}</td>`;
                html += `<td rowspan="${results.length}" data-group="${key}">${result.protocol.toUpperCase()}</td>`;
            }

            html += `<td>${result.apiType || '-'}</td>`;
            html += `<td>${result.versions.join(', ') || '-'}</td>`;

            let statusClass = '';
            let statusIcon = '';
            if (result.status === 'READABLE_OK') {
                statusClass = 'status-readable';
                statusIcon = '🟢';
            } else if (result.status === 'REACHABLE_CORS_BLOCKED') {
                statusClass = 'status-cors';
                statusIcon = '🟡';
            } else if (result.status === 'UNREACHABLE') {
                statusClass = 'status-unreachable';
                statusIcon = '🔴';
            } else {
                statusClass = 'status-not-nmos';
                statusIcon = '🔵';
            }

            html += `<td><span class="status-badge ${statusClass}">${statusIcon} ${result.status}</span></td>`;

            if (idx === 0) {
                const probClass = probability === 'HIGH' ? 'probability-high' :
                                probability === 'MEDIUM' ? 'probability-medium' :
                                'probability-low';
                html += `<td rowspan="${results.length}" data-group="${key}" class="${probClass}">${probability}</td>`;
            }

            const target = document.getElementById('target').value.trim();
            const endpointPrefix = document.getElementById('endpoint').value.trim();
            const basePath = result.basePath === '/' ? '' : result.basePath;
            const baseUrl = `${result.protocol}://${target}:${result.port}${basePath}${endpointPrefix}`;
            html += `<td><div class="links">`;
            html += `<a href="${baseUrl}" target="_blank" class="link-btn">Open Base</a>`;
            html += `<a href="${result.url}" target="_blank" class="link-btn">Open Endpoint</a>`;
            html += `<button class="link-btn" onclick="copyToClipboard('${result.url}')">Copy URL</button>`;
            html += '</div></td>';

            html += '</tr>';
        });
    });

    html += '</tbody></table>';
    resultsContainer.innerHTML = html;
    resultsStats.textContent = `${Object.keys(groupedResults).length} port(s) discovered`;
    attachRowHoverHandlers();
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('URL copied to clipboard');
    });
}

function attachRowHoverHandlers() {
    const rows = resultsContainer.querySelectorAll('tbody tr[data-group]');
    rows.forEach(row => {
        const group = row.dataset.group;
        row.addEventListener('mouseenter', () => {
            row.classList.add('row-hover');
            resultsContainer.querySelectorAll(`tbody td[data-group="${group}"]`).forEach(cell => {
                cell.classList.add('group-hover');
            });
        });
        row.addEventListener('mouseleave', () => {
            row.classList.remove('row-hover');
            resultsContainer.querySelectorAll(`tbody td[data-group="${group}"]`).forEach(cell => {
                cell.classList.remove('group-hover');
            });
        });
    });
}

async function startExploration() {
    const target = document.getElementById('target').value.trim();
    const ports = getPorts();
    const protocol = document.getElementById('protocol').value;
    const endpoint = document.getElementById('endpoint').value.trim();
    const basePaths = getBasePaths();
    const timeout = parseInt(document.getElementById('timeout').value);
    const interval = parseInt(document.getElementById('interval').value);
    const concurrency = parseInt(document.getElementById('concurrency').value);

    if (!target) {
        alert('Please enter a target IP address or hostname');
        return;
    }

    if (!isLocalTarget(target)) {
        const proceed = confirm('Target is not a local address range. Proceed only if you are authorized to test it.');
        if (!proceed) {
            return;
        }
    }

    if (ports.length === 0) {
        alert('Please specify at least one port (list or range)');
        return;
    }

    state.isRunning = true;
    state.shouldStop = false;
    state.results = [];
    state.completedTasks = 0;

    // Dynamic task counting - we'll update this as we discover endpoints
    // Initial estimate: just count the initial checks
    state.totalTasks = ports.length * basePaths.length * NMOS_APIS.length;
    state.maxTasksPerPort = state.totalTasks / ports.length;

    startBtn.disabled = true;
    stopBtn.disabled = false;
    progressSection.classList.add('active');
    resultsSection.classList.add('active');

    updateProgress();

    const queue = [...ports];
    const workers = [];

    for (let i = 0; i < concurrency; i++) {
        workers.push((async () => {
            while (queue.length > 0 && !state.shouldStop) {
                const port = queue.shift();
                if (port === undefined) break;

                const results = await explorePort(target, port, protocol, endpoint, basePaths, timeout, interval);
                state.results.push(...results);
                renderResults();
            }
        })());
    }

    await Promise.all(workers);

    state.isRunning = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;

    if (state.shouldStop) {
        progressInfo.textContent = 'Exploration stopped by user';
    } else {
        progressInfo.textContent = 'Exploration completed';
    }

    renderResults();
    updatePortListFromResults();
    saveSettings();
}

function stopExploration() {
    state.shouldStop = true;
    stopBtn.disabled = true;
}

function clearResults() {
    state.results = [];
    state.completedTasks = 0;
    state.totalTasks = 0;
    progressSection.classList.remove('active');
    renderResults();
}

function saveSettings() {
    const settings = {
        portList: document.getElementById('portList').value,
        portRangeStart: document.getElementById('portRangeStart').value,
        portRangeEnd: document.getElementById('portRangeEnd').value,
        interval: document.getElementById('interval').value,
        timeout: document.getElementById('timeout').value,
        concurrency: document.getElementById('concurrency').value,
        protocol: document.getElementById('protocol').value,
        endpoint: document.getElementById('endpoint').value,
        basePath: document.getElementById('basePath').value
    };
    localStorage.setItem('nmosPortExplorerSettings', JSON.stringify(settings));
}

function loadSettings() {
    const saved = localStorage.getItem('nmosPortExplorerSettings');
    if (saved) {
        try {
            const settings = JSON.parse(saved);
            document.getElementById('portList').value = settings.portList || '';
            document.getElementById('portRangeStart').value = settings.portRangeStart || '';
            document.getElementById('portRangeEnd').value = settings.portRangeEnd || '';
            document.getElementById('interval').value = settings.interval || 0;
            document.getElementById('timeout').value = settings.timeout || 100;
            document.getElementById('concurrency').value = settings.concurrency || 10;
            document.getElementById('protocol').value = settings.protocol || 'http';
            document.getElementById('endpoint').value = settings.endpoint || '/x-nmos';
            document.getElementById('basePath').value = settings.basePath || '';
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    } else {
        document.getElementById('portList').value = defaultPortList;
        saveSettings();
    }
}

// Port Tab Switching
portTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        // Remove active class from all tabs
        portTabs.forEach(t => t.classList.remove('active'));
        portTabContents.forEach(c => c.classList.remove('active'));

        // Add active class to clicked tab
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        const contentId = tabName === 'list' ? 'portTabList' : 'portTabRange';
        document.getElementById(contentId).classList.add('active');
    });
});

// Collapsible Section Toggles
document.querySelectorAll('.section-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
        const targetId = toggle.getAttribute('data-target');
        const target = document.getElementById(targetId);
        if (!target) return;

        const willExpand = target.classList.contains('collapsed');
        target.classList.toggle('collapsed', !willExpand);
        toggle.setAttribute('aria-expanded', String(willExpand));
        toggle.classList.toggle('is-collapsed', !willExpand);
    });
});

// Modal functions
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function resetSettings() {
    if (confirm('Reset all settings to defaults?')) {
        document.getElementById('portList').value = defaultPortList;
        document.getElementById('portRangeStart').value = '';
        document.getElementById('portRangeEnd').value = '';
        document.getElementById('interval').value = 0;
        document.getElementById('timeout').value = 100;
        document.getElementById('concurrency').value = 10;
        document.getElementById('protocol').value = 'http';
        document.getElementById('endpoint').value = '/x-nmos';
        document.getElementById('basePath').value = '';
        saveSettings();
        alert('Settings reset to defaults');
    }
}

function clearAllData() {
    if (confirm('Clear all stored data including settings and results?')) {
        localStorage.clear();
        location.reload();
    }
}

// Event Listeners
form.addEventListener('submit', (e) => {
    e.preventDefault();
    startExploration();
});

stopBtn.addEventListener('click', stopExploration);
clearBtn.addEventListener('click', clearResults);

// Settings tab switching
document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const modal = tab.closest('.modal');
        const tabName = tab.dataset.tab;

        // Remove active from all tabs in this modal
        modal.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        modal.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));

        // Add active to clicked tab
        tab.classList.add('active');
        const targetContent = modal.querySelector(`#${tabName}Tab`);
        if (targetContent) {
            targetContent.classList.add('active');
        }
    });
});

// Accordion functionality
document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
        const accordionId = header.dataset.accordion;
        const content = document.getElementById(accordionId);
        const isActive = header.classList.contains('active');

        // Close all accordions in the same container
        const accordion = header.closest('.accordion');
        accordion.querySelectorAll('.accordion-header').forEach(h => h.classList.remove('active'));
        accordion.querySelectorAll('.accordion-content').forEach(c => c.classList.remove('active'));

        // Toggle current accordion
        if (!isActive) {
            header.classList.add('active');
            content.classList.add('active');
        }
    });
});

// Modal event listeners
document.getElementById('settingsBtn').addEventListener('click', () => openModal('settingsModal'));
document.getElementById('aboutBtn').addEventListener('click', () => {
    openModal('settingsModal');
    // Switch to About tab
    const settingsModal = document.getElementById('settingsModal');
    settingsModal.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    settingsModal.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
    settingsModal.querySelector('[data-tab="about"]').classList.add('active');
    document.getElementById('aboutTab').classList.add('active');
});
document.getElementById('settingsModalClose').addEventListener('click', () => closeModal('settingsModal'));
document.getElementById('resetSettingsBtn').addEventListener('click', resetSettings);
document.getElementById('clearStorageBtn').addEventListener('click', clearAllData);

// Close modal on background click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal(modal.id);
        }
    });
});

// Close modal on ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            closeModal(modal.id);
        });
    }
});

// Set custom validation messages
document.getElementById('target').addEventListener('invalid', function(e) {
    e.target.setCustomValidity('Please enter a target IP address or hostname.');
});

document.getElementById('target').addEventListener('input', function(e) {
    e.target.setCustomValidity('');
});

document.getElementById('portRangeStart').addEventListener('invalid', function(e) {
    e.target.setCustomValidity('Please enter a valid port number (1-65535).');
});

document.getElementById('portRangeStart').addEventListener('input', function(e) {
    e.target.setCustomValidity('');
});

document.getElementById('portRangeEnd').addEventListener('invalid', function(e) {
    e.target.setCustomValidity('Please enter a valid port number (1-65535).');
});

document.getElementById('portRangeEnd').addEventListener('input', function(e) {
    e.target.setCustomValidity('');
});

// Initialize
loadSettings();
