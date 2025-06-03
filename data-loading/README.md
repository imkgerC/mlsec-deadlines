# Scraping for conference information

This is a simple setup to scrape conference information from various sources and unify it.

## Running
Running this script requires [uv](https://github.com/astral-sh/uv) to be installed. You can then run it using

> uv run main.py

from this directory, which will create the resulting data dump in `../web/data/conferences.json`.

## Implementation
All sources are implemented in `src/sources` and implement the interface described by the abstract class `DataSource` in `src/sources/base.py`.