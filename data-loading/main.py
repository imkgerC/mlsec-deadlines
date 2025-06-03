import logging
import traceback

from typing import List

from src.sources import DataSource
from src.model import ConferenceStore


logger = logging.getLogger(__name__)

if __name__ == "__main__":
    store = ConferenceStore()
    sources: List[DataSource] = [source_cls() for source_cls in DataSource.sources]
    for source in sources:
        try:
            source.initial_load_to(store)
        except:
            logger.error(traceback.format_exc())
    for source in sources:
        source.additional_load_to(store)
    
    
    with open("../web/data/conferences.json", "w") as f:
        f.write(store.serialize())