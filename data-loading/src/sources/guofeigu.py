import re
import copy
import logging

import requests
from bs4 import BeautifulSoup

from .base import DataSource
from ..model import AcceptanceStatistics, Category

logger = logging.getLogger(__name__)
URL = "https://people.engr.tamu.edu/guofei/sec_conf_stat.htm"

class GuofeiGu(DataSource):
    def initial_load_to(self, store):
        pass # no standalone data

    def additional_load_to(self, store):
        r = requests.get(URL)
        if r.status_code != 200:
            logger.error(f"Could not load {URL}, status {r.status_code}")
            return
        soup = BeautifulSoup(r.text, features="html.parser")
        tables = soup.find_all("table")
        # hard code second table as correct one
        table = tables[1].find("tbody")
        
        column_names = {}
        statistics_pattern = r"\d+[.]\d\%[ ]?\((\d+)\/(\d+)"
        all_acceptances = {}
        for i, row in enumerate(table.find_all("tr")):
            if i == 0:
                continue
            if i == 1:
                for j, col in enumerate(row.find_all("td")):
                    text = col.find("a").text
                    name = store.normalize_series_name(text)
                    column_names[j+1] = name
                    all_acceptances[j+1] = []
                continue
            children = row.find_all("td")
            year = int(children[0].text)
            for j in range(1, len(children)):
                match = re.search(statistics_pattern, children[j].text)
                if match is None:
                    continue

                submitted = int(match.group(2))
                accepted = int(match.group(1))
                all_acceptances[j].append((year, AcceptanceStatistics(
                    submitted=submitted,
                    accepted=accepted,
                )))
        
        for j, name in column_names.items():
            series = store.find_series(name, Category.Security)
            if len(series) != 1:
                continue # series does not exist in our data
            series = copy.deepcopy(series[0])
            
            for year, statistic in all_acceptances[j]:
                series.acceptance_statistics[year] = statistic
            store.add_or_merge_series(series)