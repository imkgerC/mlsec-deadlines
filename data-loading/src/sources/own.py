import os
import json
import logging

from typing import Optional

from dateutil.parser import parse

from .base import DataSource
from ..model import (
    Conference, ConferenceSeries, ConferenceStore,
    Event, Category, AcceptanceStatistics
)

logger = logging.getLogger(__name__)

class Own(DataSource):
    def _try_parse_series(self, entry) -> Optional[ConferenceSeries]:
        if "name" not in entry:
            logger.warning("No name found in series entry")
            return None
        name = str(entry["name"])
        
        if "category" not in entry:
            logger.warning("No category found in series entry")
            return None
        category = str(entry["category"])
        if category not in Category._value2member_map_:
            logger.warning("Category in series entry could not be matched to member map")
            return None
        category = Category._value2member_map_[category]

        if "description" not in entry:
            logger.warning("No description found in series entry")
            return None
        description = str(entry["description"])

        if "conferences" not in entry or type(entry["conferences"]) is not dict:
            logger.warning("No conferences found in series entry")
            return None
        conferences = {}
        for year, conf in entry["conferences"].items():
            conf = self._try_parse_conference(conf)
            if conf is None or not year.isnumeric():
                logger.warning("Could not parse conference found in series entry")
                return None
            year = int(year)
            conferences[year] = conf
        
        if "acceptance_statistics" not in entry or type(entry["acceptance_statistics"]) is not dict:
            logger.warning("No acceptance statistics found in series entry")
            return None
        acceptance_statistics = {}
        for year, stats in entry["acceptance_statistics"].items():
            stats = self._try_parse_statistics(stats)
            if stats is None or not year.isnumeric():
                logger.warning("Could not parse acceptance statistics found in series entry")
                return None
            year = int(year)
            acceptance_statistics[year] = stats
        
        if "rankings" not in entry or type(entry["rankings"]) is not dict:
            logger.warning("No rankings found in series entry")
            return None
        rankings = {}
        for ranking_org, rank in entry["rankings"].items():
            rankings[ranking_org] = rank

        return ConferenceSeries(
            name=name,
            category=category,
            description=description,
            conferences=conferences,
            rankings=rankings,
            acceptance_statistics=acceptance_statistics,
        )
    
    def _try_parse_statistics(self, entry) -> Optional[AcceptanceStatistics]:
        if "accepted" not in entry or type(entry["accepted"]) is not int:
            logger.warning("No accepted found in acceptance statistics entry")
            return None
        accepted = int(entry["accepted"])
        if "submitted" not in entry or type(entry["submitted"]) is not int:
            logger.warning("No accepted found in acceptance statistics entry")
            return None
        submitted = int(entry["submitted"])
        return AcceptanceStatistics(
            accepted=accepted,
            submitted=submitted,
        )
    
    def _try_parse_conference(self, entry) -> Optional[Conference]:
        if "link" not in entry:
            logger.warning("No link found in conference entry")
            return None
        link = str(entry["link"])
        if "location" not in entry:
            logger.warning("No location found in conference entry")
            return None
        location = str(entry["location"])
        if "timeline" not in entry or type(entry["timeline"]) is not list:
            logger.warning("No timeline found in conference entry")
            return None
        timeline = []
        for event in timeline:
            event = self._try_parse_event(event)
            if event is None:
                logger.warning("Could not parse event found in conference entry")
                return None
            timeline.append(event)
        return Conference(
            link=link,
            location=location,
            timeline=timeline,
        )
    
    def _try_parse_event(self, entry) -> Optional[Event]:
        if "description" not in entry:
            logger.warning("No description found in conference entry")
            return None
        description = str(entry["description"])
        if "date" not in entry:
            logger.warning("No date found in conference entry")
            return None
        date = parse(entry["date"])
        return Event(
            date=date,
            description=description,
        )

    def initial_load_to(self, store):
        if not os.path.exists("../docs/data/conferences.json"):
            return
        
        with open("../docs/data/conferences.json", "r", encoding="utf8") as f:
            data = json.load(f)

        for value in data.values():
            # ignore keys, as all information can be restored from the values alone
            series = self._try_parse_series(value)
            if series is None:
                continue
            store.add_or_merge_series(series)

    def additional_load_to(self, store):
        pass # no additional enrichment data