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

function filterDate(conferences, date) {
    return conferences.filter(c => c.deadline > date);
}

function filterTitles(conferences, excludeTitles) {
    return Object.fromEntries(Object.entries(conferences).filter(([t, c]) => !excludeTitles.includes(c.title)));
}

function getConferenceView(conference) {
    const container = document.createElement("div");
    container.classList.add("conference-container");

    const secondsUntilDeadline = (conference.deadline - new Date()) / 1000;
    const formatETA = (totalSeconds) => {
        if (totalSeconds < 1) {
            return "passed";
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
    
    container.innerHTML = `
    <div class="conference-info">
        <span class="conference-title">${conference.title}</span>
        <span class="conference-extra-info">${conference.description}</span>
    </div>
    <div class="conference-deadline-info">
        <span class="conference-eta">${formatETA(secondsUntilDeadline)}</span>
        <span class="conference-extra-info">${conference.deadline.toLocaleString()}</span>
        <span class="conference-extra-info">${conference.timeline.comment ? "Comment: " + conference.timeline.comment : "&nbsp;"}</span>
    </div>
    `;

    return container;
}

function showConferences(conferences) {
    // assumes conferences are sorted by deadline
    const shadowDom = document.createElement("div");
    shadowDom.id = "app";
    
    for (const conference of conferences) {
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
    let afterNow = filterDate(conferences, new Date());
    showConferences(afterNow);
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