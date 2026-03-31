const SYSTEMY = { 'GPS': 23 + 56 / 60, 'GLONASS': 22.5, 'BeiDou': 25 + 46 / 60, 'Galileo': 28 + 10 / 60 };
const MS_IN_HOUR = 3600000;

/**
 * Formats a Date object into a time string, adding the date if it's outside the target day.
 * @param {Date} cas The date to format.
 * @param {Date} d2_start The start of the target day.
 * @param {Date} d2_end The end of the target day.
 * @returns {string} The formatted time string.
 */
function formatCas(cas, d2_start, d2_end) {
    const timeStr = cas.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (cas < d2_start || cas > d2_end) {
        return `${timeStr} (${cas.toLocaleDateString('cs-CZ')})`;
    }
    return timeStr;
}

/**
 * Renders all the results into the DOM.
 * @param {object} data - The data to render.
 * @param {object[]} data.safeWindows - Array of safe time windows.
 * @param {object[]} data.merged - Array of merged forbidden time intervals.
 * @param {object[]} data.results - Array of detailed, unmerged results per system.
 * @param {Date} data.d2_start - The start of the target day for formatting.
 * @param {Date} data.d2_end - The end of the target day for formatting.
 */
function renderResults({ safeWindows, merged, results, d2_start, d2_end }) {
    const vysledkyEl = document.getElementById('vysledky');

    if (merged.length === 0) {
        vysledkyEl.innerHTML = "<p>✅ Žádné kritické intervaly. Měření je možné po celý den.</p>";
        return;
    }

    let html = "";

    // 1. Display safe windows
    if (safeWindows.length > 0) {
        html += `<div class="safe-container">
                    <h2>Přípustné intervaly pro 2. měření</h2>`;
        safeWindows.forEach(sw => {
            html += `<div class="safe-item"> ${formatCas(sw.od, d2_start, d2_end)} — ${formatCas(sw.do, d2_start, d2_end)}</div>`;
        });
        html += `</div>`;
    }

    // 2. Display forbidden (merged) intervals and detailed table
    html += `<div class="summary-container" style="margin-top: 15px;">
                <h2>Nepřípustné intervaly pro 2. měření</h2>`;
    for (const m of merged) {
        html += `<div class="merged-item">${formatCas(m.casOd, d2_start, d2_end)} — ${formatCas(m.casDo, d2_start, d2_end)}</div>`;
    }
    html += `</div>`;

    html += `<h3>Detailní rozpis dle systémů</h3>
             <div class="table-wrapper">
             <table><thead><tr><th>Systém</th><th>Podobné postavení družic od</th><th>Podobné postavení družic do</th><th>Orbitální cyklus</th></tr></thead><tbody>`;
    for (const res of results) {
        html += `<tr>
            <td><strong>${res.nazev}</strong></td>
            <td>${formatCas(res.casOd, d2_start, d2_end)}</td>
            <td>${formatCas(res.casDo, d2_start, d2_end)}</td>
            <td>k = ${res.k}</td>
        </tr>`;
    }
    html += "</tbody></table></div>";

    vysledkyEl.innerHTML = html;
}

function vypocitej() {
    const d1_val = document.getElementById('d1').value;
    const t1_val = document.getElementById('t1').value;
    const d2_str = document.getElementById('d2').value;
    const alertBox = document.getElementById('alertBox');

    // Ošetření chybějících vstupů
    if (!d1_val || !t1_val || !d2_str) {
        alertBox.innerHTML = `<div class="warning" style="border-left-color: var(--danger); background-color: #f8d7da; color: #721c24;"><strong>Chyba:</strong> Prosím zadejte platné datum a čas pro obě měření.</div>`;
        document.getElementById('vysledky').innerHTML = "";
        return;
    }

    const t1 = new Date(`${d1_val}T${t1_val}`);
    const d2_start = new Date(d2_str + "T00:00:00");
    const d2_end = new Date(d2_str + "T23:59:59");

    // Ošetření chronologie (2. měření nesmí být před 1. měřením)
    if (d2_end < t1) {
        alertBox.innerHTML = `<div class="warning" style="border-left-color: var(--danger); background-color: #f8d7da; color: #721c24;"><strong>Chyba:</strong> Datum plánovaného 2. měření nemůže předcházet 1. měření.</div>`;
        document.getElementById('vysledky').innerHTML = "";
        return;
    }

    // Kontrola změny času
    const offset1 = t1.getTimezoneOffset();
    const offset2 = d2_end.getTimezoneOffset();

    alertBox.innerHTML = offset1 !== offset2
        ? `<div class="warning"><strong>Upozornění:</strong> Mezi měřeními dochází k přechodu na letní/zimní čas. Výpočet s tím počítá a zobrazené časy jsou již správně převedeny do času platného v den plánovaného měření.</div>`
        : "";

    const t1_ms = t1.getTime();

    const pdopSwitch = document.getElementById('pdop_switch');
    const intervalHalfWidthMs = pdopSwitch.checked ? 3 * MS_IN_HOUR : 1 * MS_IN_HOUR;
    const results = [];

    for (const [nazev, n] of Object.entries(SYSTEMY)) {
        const n_ms = n * MS_IN_HOUR;

        const k_min_bound = (d2_start.getTime() - t1_ms - intervalHalfWidthMs) / n_ms;
        const k_max_bound = (d2_end.getTime() - t1_ms + intervalHalfWidthMs) / n_ms;
        const k_start = Math.max(0, Math.floor(k_min_bound));
        const k_end = Math.ceil(k_max_bound);

        for (let k = k_start; k < k_end; k++) {
            const stredCasMs = t1_ms + n_ms * k;
            const casOd = new Date(stredCasMs - intervalHalfWidthMs);
            const casDo = new Date(stredCasMs + intervalHalfWidthMs);

            if (casOd <= d2_end && casDo >= d2_start) {
                results.push({ nazev, casOd, casDo, k });
            }
        }
    }

    results.sort((a, b) => a.casOd - b.casOd);

    const merged = [];
    if (results.length > 0) {
        let current = { ...results[0] };

        for (let i = 1; i < results.length; i++) {
            const next = results[i];
            if (next.casOd <= current.casDo) {
                if (next.casDo.getTime() > current.casDo.getTime()) {
                    current.casDo = next.casDo;
                }
            } else {
                merged.push(current);
                current = { ...next };
            }
        }
        merged.push(current);
    }

    const safeWindows = [];
    let lastEnd = d2_start;
    merged.forEach(m => {
        if (m.casOd > lastEnd) {
            safeWindows.push({ od: lastEnd, do: m.casOd });
        }
        lastEnd = m.casDo > lastEnd ? m.casDo : lastEnd;
    });
    if (lastEnd < d2_end) {
        safeWindows.push({ od: lastEnd, do: d2_end });
    }

    renderResults({ safeWindows, merged, results, d2_start, d2_end });
}

document.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector('button');
    if (button) {
        button.addEventListener('click', vypocitej);
    }
});