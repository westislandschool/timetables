// CONFIGURATION VARIABLES - UPDATE THESE BEFORE UPLOADING
const GOOGLE_CLIENT_ID = "1072308375404-tsk3rhfhil9pf6hv9c98vqachv07q484.apps.googleusercontent.com";
const ALLOWED_DOMAIN = "wis.edu.hk"; // e.g., "school.edu" or "mycompany.org"

// Global state
let globalTimetableData = [];
let globalMaxDays = 10;
let globalPeriods = [];
let currentSortColumn = 'Entity'; 
let currentSortDirection = 'asc';

// Attach Event Listeners
document.getElementById('viewSelect').addEventListener('change', handleViewChange, false);
document.getElementById('mainEntityFilter').addEventListener('input', renderSelectedView, false);
document.getElementById('classFilter').addEventListener('input', renderSelectedView, false);
document.getElementById('gridTeacherFilter').addEventListener('input', renderSelectedView, false);
document.getElementById('gridRoomFilter').addEventListener('input', renderSelectedView, false);
document.getElementById('printTimetablesBtn').addEventListener('click', printIndividualTimetables, false);
document.getElementById('printSummaryBtn').addEventListener('click', printFilteredSummary, false);
document.getElementById('refreshTimetableBtn').addEventListener('click', fetchLiveTimetableFromDrive, false);

// INITIALIZE AND CHECK FOR LOCALHOST ON PAGE LOAD
window.addEventListener('DOMContentLoaded', () => {
    const hostname = window.location.hostname;
    
    // Check if the app is running locally for development
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "") {
        console.log("🛠️ Localhost detected: Bypassing Google Sign-In protection for development.");
        
        // Hide the login wall and reveal the application immediately
        document.getElementById("authWall").style.display = "none";
        document.getElementById("protectedApp").style.display = "block";
        document.getElementById("userBadge").textContent = "🛠️ Dev Mode (Localhost)";
        
        // Automatically fetch data from your Apps Script
        fetchLiveTimetableFromDrive();
    } else {
        // Enforce production security rules on GitHub Pages
        if (typeof google !== 'undefined') {
            google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: handleCredentialResponse
            });
            google.accounts.id.renderButton(
                document.getElementById("buttonDiv"),
                { theme: "outline", size: "large", width: "100%" } 
            );
        } else {
            console.error("Google Identity SDK failed to load.");
            alert("Security initialization failed. Verify your internet connection.");
        }
    }
});

// Process Sign-In token and handle domain protection check (Only runs on GitHub)
function handleCredentialResponse(response) {
    try {
        const base64Url = response.credential.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        const userProfile = JSON.parse(jsonPayload);
        const userEmail = userProfile.email.toLowerCase();

        if (userEmail.endsWith("@" + ALLOWED_DOMAIN.toLowerCase())) {
            document.getElementById("authWall").style.display = "none";
            document.getElementById("protectedApp").style.display = "block";
            document.getElementById("userBadge").textContent = `👤 ${userProfile.name} (${userProfile.email})`;

            fetchLiveTimetableFromDrive();
        } else {
            alert(`Access Denied: ${userProfile.email} is not part of the required organizational network domain (${ALLOWED_DOMAIN}).`);
            google.accounts.id.disableAutoSelect();
        }
    } catch (err) {
        console.error("Token decoding error: ", err);
        alert("Authentication failed during structural verification check.");
    }
}

function fetchLiveTimetableFromDrive() {
    // Point cleanly to your relative serverless proxy endpoint
    const proxyUrl = '/.netlify/functions/fetch-timetable';
    
    const refreshBtn = document.getElementById('refreshTimetableBtn');
    if (refreshBtn) refreshBtn.textContent = "⏳ Fetching securely via Cloud...";

    fetch(proxyUrl, { method: 'GET' })
    .then(response => {
        if (!response.ok) throw new Error(`Network response error: ${response.status}`);
        return response.text();
    })
    .then(xmlString => {
        if (refreshBtn) refreshBtn.textContent = "🔄 Reload Latest From Drive";
        parseTimetable(xmlString);
    })
    .catch(error => {
        if (refreshBtn) refreshBtn.textContent = "❌ Failed to Load";
        console.error("Fetch error details:", error);
        alert("Error auto-loading database: " + error.message);
    });
}

function handleViewChange() {
    const selectedView = document.getElementById('viewSelect').value;
    const filterControls = document.getElementById('filterControls');
    const listFilters = document.getElementById('listFilters');
    const gridFilters = document.getElementById('gridFilters');
    const mainFilterLabel = document.getElementById('mainFilterLabel');
    const mainEntityFilter = document.getElementById('mainEntityFilter');
    const printIndvBtn = document.getElementById('printTimetablesBtn');
    const printSumBtn = document.getElementById('printSummaryBtn');

    document.getElementById('mainEntityFilter').value = '';
    document.getElementById('gridTeacherFilter').value = '';
    document.getElementById('gridRoomFilter').value = '';
    document.getElementById('classFilter').value = '';

    filterControls.style.display = 'block';

    if (selectedView === 'grid') {
        listFilters.style.display = 'none';
        gridFilters.style.display = 'inline';
        printIndvBtn.style.display = 'inline-block'; 
        printSumBtn.style.display = 'inline-block';  
    } else {
        listFilters.style.display = 'inline';
        gridFilters.style.display = 'none';
        printIndvBtn.style.display = 'none'; 
        printSumBtn.style.display = 'none';
        
        if (selectedView === 'teacher' || selectedView === 'summary') {
            mainFilterLabel.textContent = "Filter Teachers:";
            mainEntityFilter.placeholder = "e.g., RAR, JLC, BCH";
        } else if (selectedView === 'room') {
            mainFilterLabel.textContent = "Filter Rooms:";
            mainEntityFilter.placeholder = "e.g., D704, B603, A808";
        }
    }
    renderSelectedView();
}

function parseTimetable(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const structs = xmlDoc.querySelectorAll('array > data > value > struct');
    
    globalTimetableData = [];
    let maxDays = 0;

    structs.forEach(struct => {
        let entry = {};
        const members = struct.querySelectorAll('member');
        
        members.forEach(member => {
            const name = member.querySelector('name').textContent;
            const valueTag = member.querySelector('value');
            entry[name] = valueTag.textContent.trim();
        });

        if (entry.DayNumber) {
            entry.DayNumber = parseInt(entry.DayNumber, 10);
            if (entry.DayNumber > maxDays) maxDays = entry.DayNumber;
        }
        globalTimetableData.push(entry);
    });

    globalMaxDays = maxDays === 0 ? 10 : maxDays; 
    
    globalPeriods = [...new Set(globalTimetableData.map(e => e.Period))].sort((a, b) => {
        const isANumeric = !isNaN(parseInt(a, 10));
        const isBNumeric = !isNaN(parseInt(b, 10));
        if (!isANumeric && isBNumeric) return -1;
        if (isANumeric && !isBNumeric) return 1;
        return parseInt(a, 10) - parseInt(b, 10);
    });

    handleViewChange();
}

function renderSelectedView() {
    if (globalTimetableData.length === 0) return;
    
    const selectedView = document.getElementById('viewSelect').value;
    if (selectedView === 'grid') {
        generateGridTimetable();
    } else if (selectedView === 'teacher' || selectedView === 'room') {
        generateRowBasedTimeline(selectedView);
    } else if (selectedView === 'summary') {
        generateTeacherSummaryTimetable();
    }
}

function generateGridTimetable() {
    const container = document.getElementById('timetableContainer');
    container.innerHTML = ''; 
    const table = document.createElement('table');

    const teacherInput = document.getElementById('gridTeacherFilter').value.toLowerCase().trim();
    const roomInput = document.getElementById('gridRoomFilter').value.toLowerCase().trim();
    const classInput = document.getElementById('classFilter').value.toLowerCase().trim();
    
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.appendChild(createCell('th', 'Periods / Days'));
    
    for (let day = 1; day <= globalMaxDays; day++) {
        headerRow.appendChild(createCell('th', `Day ${day}`));
    }
    head.appendChild(headerRow);
    table.appendChild(head);

    const tbody = document.createElement('tbody');
    globalPeriods.forEach(period => {
        const row = document.createElement('tr');
        const rowHeaderLabel = period === 'Reg' ? 'Registration' : `Period ${period}`;
        row.appendChild(createCell('td', rowHeaderLabel, true)); 

        for (let day = 1; day <= globalMaxDays; day++) {
            const cell = document.createElement('td');
            let matches = globalTimetableData.filter(e => e.DayNumber === day && e.Period === period);
            
            if (teacherInput !== "") {
                const teachers = teacherInput.split(',').map(t => t.trim()).filter(t => t !== "");
                matches = matches.filter(e => e.TeacherId && teachers.some(t => e.TeacherId.toLowerCase().includes(t)));
            }
            if (roomInput !== "") {
                const rooms = roomInput.split(',').map(r => r.trim()).filter(r => r !== "");
                matches = matches.filter(e => e.RoomCode && rooms.some(r => e.RoomCode.toLowerCase().includes(r)));
            }
            if (classInput !== "") {
                const classes = classInput.split(',').map(c => c.trim()).filter(c => c !== "");
                matches = matches.filter(e => e.ClassCode && classes.some(c => e.ClassCode.toLowerCase().includes(c)));
            }
            
            if (matches.length > 0) {
                matches.forEach(match => {
                    cell.appendChild(createClassCard(match, `${match.RoomCode || 'No Room'} (${match.TeacherId || 'N/A'})`));
                });
            } else {
                cell.style.backgroundColor = '#fafafa'; 
            }
            row.appendChild(cell);
        }
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    container.appendChild(table);
}

function printIndividualTimetables() {
    if (globalTimetableData.length === 0) return;

    const printWrapper = document.getElementById('printOrderWrapper');
    printWrapper.innerHTML = ''; 

    const teacherInput = document.getElementById('gridTeacherFilter').value.toLowerCase().trim();
    const roomInput = document.getElementById('gridRoomFilter').value.toLowerCase().trim();
    const classInput = document.getElementById('classFilter').value.toLowerCase().trim();

    let uniqueTeachers = [...new Set(globalTimetableData.map(e => e.TeacherId))].filter(id => id && id.trim() !== "");

    if (teacherInput !== "") {
        const filterTokens = teacherInput.split(',').map(t => t.trim()).filter(t => t !== "");
        uniqueTeachers = uniqueTeachers.filter(id => filterTokens.some(token => id.toLowerCase().includes(token)));
    }

    let sheetsPrinted = 0;

    uniqueTeachers.forEach(teacher => {
        let teacherRecords = globalTimetableData.filter(e => e.TeacherId === teacher);

        if (roomInput !== "") {
            const rooms = roomInput.split(',').map(r => r.trim()).filter(r => r !== "");
            teacherRecords = teacherRecords.filter(e => e.RoomCode && rooms.some(r => e.RoomCode.toLowerCase().includes(r)));
        }
        if (classInput !== "") {
            const classes = classInput.split(',').map(c => c.trim()).filter(c => c !== "");
            teacherRecords = teacherRecords.filter(e => e.ClassCode && classes.some(c => e.ClassCode.toLowerCase().includes(c)));
        }

        if (teacherRecords.length === 0 && (roomInput !== "" || classInput !== "")) return;

        sheetsPrinted++;

        const pageDiv = document.createElement('div');
        pageDiv.className = 'print-page';

        const title = document.createElement('h2');
        title.textContent = `Timetable Schedule: ${teacher}`;
        title.style.marginTop = '0';
        pageDiv.appendChild(title);

        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.appendChild(createCell('th', 'Periods / Days'));
        for (let day = 1; day <= globalMaxDays; day++) {
            headerRow.appendChild(createCell('th', `Day ${day}`));
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        globalPeriods.forEach(period => {
            const row = document.createElement('tr');
            const rowLabel = period === 'Reg' ? 'Registration' : `Period ${period}`;
            row.appendChild(createCell('td', rowLabel, true));

            for (let day = 1; day <= globalMaxDays; day++) {
                const cell = document.createElement('td');
                const matches = teacherRecords.filter(e => e.DayNumber === day && e.Period === period);

                if (matches.length > 0) {
                    matches.forEach(match => {
                        cell.appendChild(createClassCard(match, match.RoomCode || 'No Room'));
                    });
                } else {
                    cell.style.backgroundColor = '#fafafa';
                }
                row.appendChild(cell);
            }
            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        pageDiv.appendChild(table);
        printWrapper.appendChild(pageDiv);
    });

    if (sheetsPrinted === 0) {
        alert("No scheduling data matches your filter rules parameters to print.");
        return;
    }

    window.print();
}

function printFilteredSummary() {
    const mainGridTable = document.querySelector('#timetableContainer table');
    if (!mainGridTable) {
        alert("No timetable view is currently generated to print.");
        return;
    }

    const printWrapper = document.getElementById('printOrderWrapper');
    printWrapper.innerHTML = ''; 

    const pageDiv = document.createElement('div');
    pageDiv.className = 'print-page';

    const teacherInput = document.getElementById('gridTeacherFilter').value.trim();
    const title = document.createElement('h2');
    title.textContent = teacherInput ? `Master Summary Timetable (Filtered: ${teacherInput})` : "Master Summary Timetable";
    title.style.marginTop = '0';
    pageDiv.appendChild(title);

    const clonedTable = mainGridTable.cloneNode(true);
    pageDiv.appendChild(clonedTable);
    
    printWrapper.appendChild(pageDiv);
    window.print();
}

function generateRowBasedTimeline(type) {
    const container = document.getElementById('timetableContainer');
    container.innerHTML = ''; 
    const table = document.createElement('table');

    const entityInput = document.getElementById('mainEntityFilter').value.toLowerCase().trim();
    const classFilterValue = document.getElementById('classFilter').value.toLowerCase().trim();
    
    const targetField = type === 'teacher' ? 'TeacherId' : 'RoomCode';
    const displayLabel = type === 'teacher' ? 'Teacher' : 'Room';

    const uniqueEntities = [...new Set(globalTimetableData.map(e => e[targetField]))].filter(val => val && val.trim() !== "");
    const rowsData = [];

    uniqueEntities.forEach(entity => {
        const record = { Entity: entity, schedule: {} };
        for (let d = 1; d <= globalMaxDays; d++) {
            globalPeriods.forEach(p => {
                const key = `D${d}_P${p}`;
                const matches = globalTimetableData.filter(e => e[targetField] === entity && e.DayNumber === d && e.Period === p);
                record.schedule[key] = matches.map(m => m.ClassCode || '').join(' / ');
            });
        }
        rowsData.push(record);
    });

    let filteredRows = [...rowsData];
    if (entityInput !== "") {
        const tokens = entityInput.split(',').map(t => t.trim()).filter(t => t !== "");
        filteredRows = filteredRows.filter(row => tokens.some(token => row.Entity.toLowerCase().includes(token)));
    }
    if (classFilterValue !== "") {
        filteredRows = filteredRows.filter(row => Object.values(row.schedule).some(code => code.toLowerCase().includes(classFilterValue)));
    }

    filteredRows.sort((a, b) => {
        let valA, valB;
        if (currentSortColumn === 'Entity') {
            valA = a.Entity; valB = b.Entity;
        } else {
            valA = a.schedule[currentSortColumn] || ''; valB = b.schedule[currentSortColumn] || '';
        }
        if (valA < valB) return currentSortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return currentSortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.appendChild(createSortableHeader(displayLabel, 'Entity'));
    
    for (let day = 1; day <= globalMaxDays; day++) {
        globalPeriods.forEach(period => {
            const key = `D${day}_P${period}`;
            const label = period === 'Reg' ? `D${day} Reg` : `D${day} P${period}`;
            headerRow.appendChild(createSortableHeader(label, key));
        });
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    filteredRows.forEach(row => {
        const tableRow = document.createElement('tr');
        tableRow.appendChild(createCell('td', row.Entity, true)); 

        for (let day = 1; day <= globalMaxDays; day++) {
            globalPeriods.forEach(period => {
                const cell = document.createElement('td');
                const matches = globalTimetableData.filter(e => e[targetField] === row.Entity && e.DayNumber === day && e.Period === period);
                
                if (matches.length > 0) {
                    matches.forEach(match => {
                        const dynamicLabel = type === 'teacher' ? `${match.RoomCode || 'N/A'}` : `${match.TeacherId || 'N/A'}`;
                        cell.appendChild(createClassCard(match, dynamicLabel));
                    });
                } else {
                    cell.style.backgroundColor = '#fafafa';
                }
                tableRow.appendChild(cell);
            });
        }
        tbody.appendChild(tableRow);
    });
    table.appendChild(tbody);
    container.appendChild(table);
}

function generateTeacherSummaryTimetable() {
    const container = document.getElementById('timetableContainer');
    container.innerHTML = ''; 
    const table = document.createElement('table');

    const teacherInput = document.getElementById('mainEntityFilter').value.toLowerCase().trim();
    const classFilterValue = document.getElementById('classFilter').value.toLowerCase().trim();

    const allTeachers = [...new Set(globalTimetableData.map(e => e.TeacherId))].filter(id => id && id.trim() !== "");
    let summaryRows = [];

    allTeachers.forEach(teacher => {
        const record = { Entity: teacher, dayCounts: {}, totalLessons: 0 };
        
        for (let d = 1; d <= globalMaxDays; d++) {
            const rawLessonsOnDay = globalTimetableData.filter(e => {
                const isMatch = e.TeacherId === teacher && e.DayNumber === d;
                const isNotRegistration = e.Period && e.Period.toLowerCase() !== 'reg';
                const intPeriod = parseInt(e.Period, 10);
                const isP1toP5 = !isNaN(intPeriod) && intPeriod >= 1 && intPeriod <= 5;
                
                const matchesClassFilter = classFilterValue === "" || (e.ClassCode && e.ClassCode.toLowerCase().includes(classFilterValue));
                
                return isMatch && isNotRegistration && isP1toP5 && matchesClassFilter;
            });

            const uniquePeriodsTaught = [...new Set(rawLessonsOnDay.map(e => e.Period))];
            const uniqueCount = uniquePeriodsTaught.length;

            record.dayCounts[`Day_${d}`] = uniqueCount;
            record.totalLessons += uniqueCount;
        }
        summaryRows.push(record);
    });

    if (teacherInput !== "") {
        const tokens = teacherInput.split(',').map(t => t.trim()).filter(t => t !== "");
        summaryRows = summaryRows.filter(row => tokens.some(token => row.Entity.toLowerCase().includes(token)));
    }
    if (classFilterValue !== "") {
        summaryRows = summaryRows.filter(row => row.totalLessons > 0);
    }

    summaryRows.sort((a, b) => {
        let valA, valB;
        if (currentSortColumn === 'Entity') {
            valA = a.Entity; valB = b.Entity;
        } else if (currentSortColumn === 'Total') {
            valA = a.totalLessons; valB = b.totalLessons;
        } else {
            valA = a.dayCounts[currentSortColumn] || 0;
            valB = b.dayCounts[currentSortColumn] || 0;
        }
        if (valA < valB) return currentSortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return currentSortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    headerRow.appendChild(createSortableHeader('Teacher', 'Entity'));
    for (let d = 1; d <= globalMaxDays; d++) {
        headerRow.appendChild(createSortableHeader(`Day ${d}`, `Day_${d}`));
    }
    headerRow.appendChild(createSortableHeader('Total Lessons', 'Total'));
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    summaryRows.forEach(row => {
        const tableRow = document.createElement('tr');
        tableRow.appendChild(createCell('td', row.Entity, true));

        for (let d = 1; d <= globalMaxDays; d++) {
            const countVal = row.dayCounts[`Day_${d}`];
            const cell = createCell('td', countVal);
            if (countVal === 0) cell.style.color = '#ccc'; 
            tableRow.appendChild(cell);
        }
        
        const totalCell = createCell('td', row.totalLessons, true);
        totalCell.style.backgroundColor = '#e8f5e9';
        tableRow.appendChild(totalCell);
        
        tbody.appendChild(tableRow);
    });

    table.appendChild(tbody);
    container.appendChild(table);
}

function createSortableHeader(labelText, dataColumnKey) {
    const th = document.createElement('th');
    th.style.cursor = 'pointer';
    th.style.userSelect = 'none';
    
    let directionIndicator = '';
    if (currentSortColumn === dataColumnKey) {
        directionIndicator = currentSortDirection === 'asc' ? ' 🔼' : ' 🔽';
        th.style.backgroundColor = '#388E3C'; 
    }
    
    th.textContent = labelText + directionIndicator;
    th.addEventListener('click', () => {
        if (currentSortColumn === dataColumnKey) {
            currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            currentSortColumn = dataColumnKey;
            currentSortDirection = 'asc';
        }
        renderSelectedView();
    });
    return th;
}

function createClassCard(match, lowerText) {
    const card = document.createElement('div');
    card.className = 'class-card';
    card.innerHTML = `
        <div class="class-code">${match.ClassCode || 'N/A'}</div>
        <div class="details">${lowerText}</div>
    `;
    return card;
}

function createCell(type, text, isBold = false) {
    const cell = document.createElement(type);
    cell.textContent = text;
    if (isBold) cell.style.fontWeight = 'bold';
    return cell;
}