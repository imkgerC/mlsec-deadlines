var conferenceData = undefined;
var SETTINGS = {
    "stress-toggle": true,
};

async function loadData() {
    const response = await fetch("data/conferences.json");
    return await response.json();
}

function expandConferences(conferenceData) {
    const results = [];
    for (const [key, data] of Object.entries(conferenceData)) {
        for (const [year, conf] of Object.entries(data.conferences)) {
            const conferenceStart = conf.timeline.find((e) => e.description == "Conference start");
            let conferenceDate = "TBD";
            if (conferenceStart) conferenceDate = new Date(conferenceStart.date);
            for (const event_ of conf.timeline) {
                if (event_.description == "Conference start") continue;
                if (event_.description == "Conference end") continue;
                const deadline = new Date(event_.date);
                results.push({series: data, date: conferenceDate, year: year, conference: conf, deadline: deadline, event: event_});
            }
        }
    }
    results.sort((a, b) => a.deadline - b.deadline);
    return results;
}

function filterRank(conferences, minimumRank) {
    const ranksToNumbers = {
        "A*": 0,
        "A": -1,
        "B": -2,
        "C": -3,
    }
    const rankToNumber = (rank) => {
        if (rank in ranksToNumbers) return ranksToNumbers[rank];
        return -4;
    }
    return Object.fromEntries(Object.entries(conferences).filter(([t, c]) => rankToNumber(c.rankings.core) >= rankToNumber(minimumRank)));
}

function filterCategory(conferences, allowedCategories) {
    return Object.fromEntries(Object.entries(conferences).filter(([t, c]) => allowedCategories.includes(c.category)));
}

function filterTitles(conferences, excludeTitles) {
    return Object.fromEntries(Object.entries(conferences).filter(([t, c]) => !excludeTitles.includes(c.name)));
}

function includeTitles(conferences, allConferences, includeTitles) {
    const additionalConferences = Object.fromEntries(Object.entries(allConferences).filter(([t, c]) => includeTitles.includes(c.name)));
    return {...conferences, ...additionalConferences};
}

function filterAfter(conferences, date) {
    return conferences.filter(c => c.deadline >= date);
}

function filterBefore(conferences, date) {
    return conferences.filter(c => c.deadline < date);
}

function formatRelativeTime(date1, date2 = new Date()) {
    const units = [
        { name: 'year', limit: 31536000000, inSeconds: 60 * 60 * 24 * 365 },
        { name: 'month', limit: 2592000000, inSeconds: 60 * 60 * 24 * 30 },
        { name: 'week', limit: 604800000, inSeconds: 60 * 60 * 24 * 7 }, 
        { name: 'day', limit: 86400000, inSeconds: 60 * 60 * 24 },
        { name: 'hour', limit: 3600000, inSeconds: 60 * 60 },
        { name: 'minute', limit: 60000, inSeconds: 60 },
        { name: 'second', limit: 1000, inSeconds: 1 }
    ];

    const diff = Math.abs(date1 - date2);
    const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

    for (const unit of units) {
        if (diff >= unit.limit) {
            const value = Math.floor(diff / unit.limit);
            return formatter.format(Math.sign(date1 - date2) * value, unit.name);
        }
    }

    return formatter.format(0, 'second'); // Default to "now" if the difference is very small
}

function getConferenceView(conference) {
    const container = document.createElement("div");
    container.classList.add("conference-container");

    const formatETA = (deadline) => {
        const now = new Date();
        let totalSeconds = (conference.deadline - now) / 1000;
        if (totalSeconds < 1 || !SETTINGS["stress-toggle"]) {
            return formatRelativeTime(deadline, now);
        }
        const leftPad = (s) => {
            s = "" + s;
            while (s.length < 2) s = "0" + s;
            return s;
        }

        const secondsPerDay = 24 * 60 * 60;
        const days = Math.floor(totalSeconds / secondsPerDay);
        totalSeconds -= days * secondsPerDay;
        const secondsPerHour = 60 * 60;
        const hours = Math.floor(totalSeconds / secondsPerHour);
        totalSeconds -= hours * secondsPerHour;
        const secondsPerMinute = 60;
        const minutes = Math.floor(totalSeconds / secondsPerMinute);
        totalSeconds -= minutes * secondsPerMinute;
        const seconds = Math.floor(totalSeconds);

        let result = "";
        if (days > 0) {
            result += `${days} days`;
        }
        if (days > 0 || hours > 0) {
            result += ` ${leftPad(hours)} hours`;
        }
        if (days > 0 || hours > 0 || minutes > 0) {
            result += ` ${leftPad(minutes)} mins`;
        }
        result += ` ${leftPad(seconds)} s`;

        return result;
    };
    
    let acceptanceRateHTML = "";
    if (conference.series.acceptance_statistics && Object.entries(conference.series.acceptance_statistics).length > 0) {
        acceptanceRateHTML = "Acceptance Rates: <ul>";
        for (const [year, acceptance_statistics] of Object.entries(conference.series.acceptance_statistics)) {
            const rate = acceptance_statistics.accepted/acceptance_statistics.submitted;
            const description = `${year}: ${Math.round(rate*1000)/10}% (${acceptance_statistics.accepted}/${acceptance_statistics.submitted})`;
            acceptanceRateHTML += `<li>${description}</li>`;
        }
        acceptanceRateHTML += "</ul>";
    }

    let conferenceDate = conference.date;
    if (conferenceDate instanceof Date) {
        conferenceDate = conferenceDate.toDateString();
    }

    container.innerHTML = `
    <div class="conference-info">
        <span>
            <span class="custom-tooltip-container">
                <a class="conference-title" href="${conference.conference.link}">${conference.series.name}</a>
                <span class="custom-tooltip">
                    Core Ranking: ${conference.series.rankings.core} <br />
                    ${acceptanceRateHTML}
                </span>
            </span>
        </span>
        <span class="conference-extra-info">${conference.series.description}</span>
        <span class="conference-extra-info">${conferenceDate} @ ${conference.conference.location}</span>
    </div>
    <div class="conference-deadline-info">
        <span class="conference-eta">${formatETA(conference.deadline)}</span>
        <span class="conference-extra-info">${conference.deadline.toLocaleString()}</span>
        <span class="conference-extra-info">${conference.event.description ? "Note: " + conference.event.description : "&nbsp;"}</span>
    </div>
    `;

    return container;
}

function showConferences(conferences) {
    const now = new Date();
    const upcomingConferences = filterAfter(conferences, now);
    // assumes conferences are sorted by deadline
    const shadowDom = document.createElement("div");
    shadowDom.id = "app";
    shadowDom.innerHTML = `<h3>Upcoming deadlines</h3>`;
    for (const conference of upcomingConferences) {
        shadowDom.appendChild(getConferenceView(conference));
    }

    const pastConferences = filterBefore(conferences, now);
    shadowDom.innerHTML += `<h3>Past deadlines</h3>`;
    for (const conference of pastConferences.reverse()) {
        shadowDom.appendChild(getConferenceView(conference));
    }

    document.getElementById("app").replaceWith(shadowDom);
}

function updateView() {
    filteredConferenceData = filterCategory(conferenceData, [
        "Artificial Intelligence", "Software Engineering", "Security and Privacy"
    ]);
    filteredConferenceData = filterRank(filteredConferenceData, "A");
    const conferenceExcludeList = [
        "TCC", "ICFP", "POPL", "FM", "EUROCRYPT", "PLDI", "HotOS",
        "UAI", "CRYPTO", "SOSP", "CSFW", "ASIACRYPT", "ISSRE", "CHES", "BMVC",
        "FC", "ICRA", "AISTATS", "OOPSLA", "SANER", "CAiSE", "ECOOP", "DSN",
        "Middleware", "OSDI", "IJCAI", "ISSTA", "ESORICS", "ICPC", "CP", "RE",
        "COLT", "ICSOC", "ICSOC", "ESEM", "MoDELS", "ICWS", "AAMAS", "IROS",
        "KR", "NAACL", "RSS", "ICSME", "ECAI", "PPSN", "WACV", "GECCO", "EASE",
        "ICDAR", "ICAPS", "ECCV", "EMNLP"
    ];
    filteredConferenceData = filterTitles(filteredConferenceData, conferenceExcludeList);
    const conferenceIncludeList = [
        "ACNS", "DIMVA", "EuroS&P", "SATML",
    ];
    filteredConferenceData = includeTitles(filteredConferenceData, conferenceData, conferenceIncludeList);
    let conferences = expandConferences(filteredConferenceData);
    showConferences(conferences);
}

function settingsHandler() {
    const dialog = document.querySelector("#settings");

    const stressToggle = dialog.querySelector("#stress-toggle");
    SETTINGS["stress-toggle"] = stressToggle.checked;
}

function main() {
    loadData().then(result => {
        conferenceData = result;
        updateView();
        setInterval(updateView, 500);
    });

    document.querySelector("#settings-wheel").onclick = () => {
        document.querySelector("#settings").showModal();
    };
    const dialog = document.querySelector("#settings");
    dialog.closedby = "any";
    dialog.addEventListener("close", settingsHandler);
}

window.onload = main;