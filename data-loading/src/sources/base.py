from abc import ABC, abstractmethod

from ..model import ConferenceStore


class DataSource(ABC):
    sources = []

    @classmethod
    def __init_subclass__(cls):
        super().__init_subclass__()
        cls.sources.append(cls)
    
    @abstractmethod
    def initial_load_to(self, store: ConferenceStore):
        pass

    @abstractmethod
    def additional_load_to(self, store: ConferenceStore):
        pass