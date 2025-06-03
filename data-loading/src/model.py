import re
import json
import logging
import dataclasses

from enum import Enum
from datetime import datetime
from dataclasses import dataclass
from typing import Optional, List, Dict, Tuple


logger = logging.getLogger(__name__)


class Category(str, Enum):
    Security = "Security and Privacy"
    Architecture = "Computer Engineering"
    Networking = "Networking and Distributed Systems"
    Theory = "Theoretical Computer Science"
    Graphics = "Computer Graphics"
    Engineering = "Software Engineering"
    Databases = "Databases"
    ArtificialIntelligence = "Artificial Intelligence"
    HumanInteraction = "Computer Human Interaction"
    Other = "Other"


@dataclass
class AcceptanceStatistics:
    accepted: int
    submitted: int


@dataclass
class Event:
    date: datetime
    description: str


@dataclass
class Conference:
    link: str
    location: str
    timeline: List[Event]


@dataclass
class ConferenceSeries:
    name: str
    category: Category
    description: str
    rankings: Dict[str, str]
    conferences: Dict[int, Conference] # year -> conference
    acceptance_statistics: Dict[int, AcceptanceStatistics] # year -> stats


class ConferenceStore:
    def __init__(self):
        self.series: Dict[Tuple[str, Category], ConferenceSeries] = {}
    
    def add_or_merge_series(self, series: ConferenceSeries):
        if (series.name, series.category) not in self.series:
            self.series[(series.name, series.category)] = series
            return
        # already exists in store, so need to merge attributes
        existing = self.series[(series.name, series.category)]
        
        # check for any inconsistencies that cannot be handled by merging
        if existing.description != series.description:
            logger.error(f"Description of two series to merge does not match! {series.name} {series.category}")
            return
        if any(
            ranking_org in series.rankings and series.rankings[ranking_org] != existing.rankings[ranking_org]
            for ranking_org in existing.rankings.keys()
        ):
            logger.error(f"Ranking of two series to merge does not match! {series.name} {series.category}")
            return
        
        def _are_conferences_mergeable(left: Conference, right: Conference) -> bool:
            if left.link != right.link:
                return False
            if left.location != right.location:
                return False
            # timelines can always be reconciled (with possibly dubious data in the end)
            return True

        if any(
            year in series.conferences and not _are_conferences_mergeable(series.conferences[year], existing.conferences[year])
            for year in existing.conferences.keys()
        ):
            logger.error(f"Conferences of two series to merge do not match! {series.name} {series.category}")
            return
        if any(
            year in series.acceptance_statistics and series.acceptance_statistics[year] != existing.acceptance_statistics[year]
            for year in existing.acceptance_statistics.keys()
        ):
            logger.warning(
                f"Statistics of two series to merge do not match! Series name: {series.name}, Category: {series.category.value}. "
                f"Will be merged based on best-effort."
            )

        # series are mergeable
        
        for ranking_org, rank in series.rankings.items():
            # safe because of previous check
            existing.rankings[ranking_org] = rank
        for year, stats in series.acceptance_statistics.items():
            # best-effort
            existing.acceptance_statistics[year] = stats

        for year, conference in series.conferences.items():
            if year not in existing.conferences:
                existing.conferences[year] = conference
                continue
            # link and location must be identical, because of previous check
            # therefore only merge timelines:
            # - if any existing event matches exactly, skip
            # - otherwise add event to timeline
            for event in conference.timeline:
                if event in existing.conferences[year].timeline:
                    continue
                existing.conferences[year].timeline.append(event)

        self.series[(series.name, series.category)] = existing

    def normalize_series_name(self, name: str) -> str:
        # remove organization names
        name = re.sub(r"\s", " ", name)
        name = name.replace("IEEE ", "")
        name = name.replace("ACM ", "")

        # remove superfluous whitespace
        previous = ""
        while previous != name:
            previous = name
            name = re.sub(r"\s\s+", " ", name)
            name = re.sub(r"^\s", "", name)

        return name
    
    def find_series(self, name: Optional[str] = None, category: Optional[Category] = None) -> List[ConferenceSeries]:
        if name is None and category is None:
            raise ValueError("To find series, supply either the name, category or both")
        if name is None:
            return [
                series
                for ((name, category), series) in self.series.items()
                if category == category
            ]
        if category is None:
            return [
                self.series[(name, cat)]
                for cat in Category
                if (name, cat) in self.series
            ]
        if (name, category) not in self.series:
            return []
        return [self.series[(name, category)]]
    
    def serialize(self) -> str:
        return json.dumps({
                f"{name}__CAT{category.name}": dataclasses.asdict(series)
                for (name, category), series in self.series.items()
            },
            default=str,
        )