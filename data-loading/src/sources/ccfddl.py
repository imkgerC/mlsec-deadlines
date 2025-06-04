import copy
import yaml
import logging

import requests

import daterangeparser
from dateutil.parser import parse

from .base import DataSource
from ..model import (
    Conference, ConferenceSeries, ConferenceStore,
    Event, Category, AcceptanceStatistics
)


logger = logging.getLogger(__name__)
CCFDDL_BASE_URL = "https://ccfddl.com/conference/allconf.yml"
CCFDDL_ACCEPTANCE_URL = "https://ccfddl.com/conference/allacc.yml"

def strip_invalid_yaml(s):
    res = ''
    for x in s:
        if yaml.reader.Reader.NON_PRINTABLE.match(x):
            # res += '\\x{:x}'.format(ord(x))
            continue
        res += x
    return res

class CCFDDL(DataSource):
    def _map_category(self, sub: str) -> Category:
        MAPPING = {
            "DS": Category.Architecture,
            "NW": Category.Networking,
            "SC": Category.Security,
            "SE": Category.Engineering,
            "DB": Category.Databases,
            "CT": Category.Theory,
            "CG": Category.Graphics,
            "AI": Category.ArtificialIntelligence,
            "HI": Category.HumanInteraction,
            "MX": Category.Other,
        }
        if sub not in MAPPING:
            raise ValueError(f"Unknown category {sub}, update mapping!")
        return MAPPING[sub]
    
    def _try_get_conference_dates(self, conf):
        try:
            return daterangeparser.parse(conf["date"])
        except:
            pass
        try:
            return parse(conf["date"])
        except:
            pass
        return None

    def _map_to_conference(self, conf, store: ConferenceStore) -> Conference:
        timeline = []
        for event in conf["timeline"]:
            if "TBD" in event["deadline"]:
                continue
            
            description = event["comment"] if "comment" in event else ""
            
            timezone = conf["timezone"] if "timezone" in conf else "AoE"
            timezone = timezone.replace("UTC", "")
            if timezone.lower() == "aoe":
                timezone = "-12"
                date = parse(event["deadline"] + f"{timezone}")
            date = parse(event["deadline"] + f"{timezone}")
            
            timeline.append(Event(
                date=date,
                description=description,
            ))
        possible_conference_dates = self._try_get_conference_dates(conf)
        if possible_conference_dates is not None:
            if type(possible_conference_dates) is tuple:
                start, end = possible_conference_dates
                timeline.append(Event(
                    date=start,
                    description="Conference start",
                ))
                timeline.append(Event(
                    date=end,
                    description="Conference end",
                ))
            else:
                timeline.append(Event(
                    date=possible_conference_dates,
                    description="Conference",
                ))
        
        return Conference(
            link=conf["link"],
            location=conf["place"],
            timeline=timeline,
        )

    def _map_to_series(self, entry, store: ConferenceStore) -> ConferenceSeries:
        confs = {
            int(conf["year"]): self._map_to_conference(conf, store)
            for conf in entry["confs"]
        }

        name = entry["title"]
        return ConferenceSeries(
            name=store.normalize_series_name(name),
            description=entry["description"],
            rankings=entry["rank"],
            conferences=confs,
            category=self._map_category(entry["sub"]),
            acceptance_statistics={},
        )

    def initial_load_to(self, store: ConferenceStore):
        r = requests.get(CCFDDL_BASE_URL)
        if r.status_code != 200:
            logger.error(f"Could not load {CCFDDL_BASE_URL}, status {r.status_code}")
            return
        # is encoded as utf8 but response does not indicate that
        r.encoding = r.apparent_encoding
        data = yaml.safe_load(strip_invalid_yaml(r.text))

        for entry in data:
            series = self._map_to_series(entry, store)
            store.add_or_merge_series(series)

    def _process_acceptance_entry(self, entry, store: ConferenceStore):
        # inconsistency in CCFDDL data
        name = entry["title"]
        if name == "UbiComp":
            name = "UbiComp/ISWC"
        name = store.normalize_series_name(name)

        # ccfddl only supplies the name of the conference
        # this does not uniquely identify the conference, as there can be
        # multiple conferences with the same (short) name but different category
        # e.g. FSE (Cryptography or Software Engineering)
        candidates = store.find_series(name=name)
        if len(candidates) == 0:
            # as the ccfddl data is loaded beforehand, this only happens
            # when there are inconsistent names between the acceptance and
            # conference data
            logger.warning(f"No matching conference found for {name}")
            return
        if len(candidates) > 1:
            # sort by heuristic
            # better conference would be more important
            # higher rank or higher number of years in case of tie
            CORE_RANKING = {
                "A*": 4,
                "A": 3,
                "B": 2,
                "C": 1,
                "N": 0,
            }
            candidates.sort(
                key=lambda c: (0 if "core" not in c.rankings else CORE_RANKING[c.rankings["core"]], len(c.conferences)),
                reverse=True, # descending, higher values first
            )
        series = copy.deepcopy(candidates[0])
        
        for accept_entry in entry["accept_rates"]:
            year = int(accept_entry["year"])
            if year not in series.conferences:
                # cannot add statistics for which we have no conference data
                continue
            series.acceptance_statistics[year] = AcceptanceStatistics(
                accepted=int(accept_entry["accepted"]),
                submitted=int(accept_entry["submitted"])
            )
        
        store.add_or_merge_series(series)
        

    def additional_load_to(self, store):
        r = requests.get(CCFDDL_ACCEPTANCE_URL)
        if r.status_code != 200:
            logger.error(f"Could not load {CCFDDL_ACCEPTANCE_URL}, status {r.status_code}")
            return
        # is encoded as utf8 but response does not indicate that
        r.encoding = r.apparent_encoding
        data = yaml.safe_load(strip_invalid_yaml(r.text))

        for entry in data:
            self._process_acceptance_entry(entry, store)        
