var conferenceData = undefined;

async function loadData() {
    const YAML = await import("https://cdn.jsdelivr.net/npm/yaml@2.8.0/+esm");
    
    const acceptanceResponse = await fetch("https://ccfddl.com/conference/allacc.yml");
    const acceptanceStatistics = await YAML.parse(await acceptanceResponse.text());
    
    const confResponse = await fetch("https://ccfddl.com/conference/allconf.yml");
    const conferences = await YAML.parse(await confResponse.text());
    
    // transform data into canonical form
    const result = {};
    for (const entry of conferences) {
        result[entry.title] = entry
    }
    for (const entry of acceptanceStatistics) {
        if (entry.title in result) {
            result[entry.title] = {...result[entry.title], ...entry}
        }
    }

    return result;
}

function expandConferences(conferenceData) {
    const results = [];
    for (const [title, data] of Object.entries(conferenceData)) {
        for (const conf of data.confs) {
            for (const timeline of conf.timeline) {
                if (timeline.deadline == "TBD") continue;
                let timezone = conf.timezone;
                if (timezone == "AoE") timezone = "UTC-12";
                const deadline = new Date(timeline.deadline + " " + timezone);
                results.push({...data, conf: conf, deadline: deadline, timeline: timeline});
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
    return Object.fromEntries(Object.entries(conferences).filter(([t, c]) => rankToNumber(c.rank.core) >= rankToNumber(minimumRank)));
}

function filterSub(conferences, allowedSubs) {
    return Object.fromEntries(Object.entries(conferences).filter(([t, c]) => allowedSubs.includes(c.sub)));
}

function filterTitles(conferences, excludeTitles) {
    return Object.fromEntries(Object.entries(conferences).filter(([t, c]) => !excludeTitles.includes(c.title)));
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
        if (totalSeconds < 1) {
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
    
    let acceptanceRate = "NaN";
    if (conference.accept_rates) {
        const mostRecent = conference.accept_rates[conference.accept_rates.length - 1];
        acceptanceRate = mostRecent.str;
    }

    container.innerHTML = `
    <div class="conference-info">
        <span>
            <span class="custom-tooltip-container">
                <a class="conference-title" href="${conference.conf.link}">${conference.title}</a>
                <span class="custom-tooltip">
                    Core Ranking: ${conference.rank.core} <br />
                    Acceptance Rate: ${acceptanceRate}
                </span>
            </span>
        </span>
        <span class="conference-extra-info">${conference.description}</span>
        <span class="conference-extra-info">${conference.conf.date} @ ${conference.conf.place}</span>
    </div>
    <div class="conference-deadline-info">
        <span class="conference-eta">${formatETA(conference.deadline)}</span>
        <span class="conference-extra-info">${conference.deadline.toLocaleString()}</span>
        <span class="conference-extra-info">${conference.timeline.comment ? "Note: " + conference.timeline.comment : "&nbsp;"}</span>
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
    filteredConferenceData = filterSub(conferenceData, ["SE", "AI", "SC"]);
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
    let conferences = expandConferences(filteredConferenceData);
    showConferences(conferences);
}

function main() {
    loadData().then(result => {
        conferenceData = result;
        console.log(conferenceData)
        updateView();
        console.log(setInterval(updateView, 500))
    });
}

window.onload = main;