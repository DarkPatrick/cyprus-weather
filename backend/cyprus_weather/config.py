"""Weather-only configuration; no device, credentials or home database."""
import os
from dataclasses import dataclass
from pathlib import Path

def load_env_file(path):
    p = Path(path)
    if p.is_file():
        for line in p.read_text().splitlines():
            if line.strip() and not line.lstrip().startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

@dataclass
class Settings:
    weather_db: str
    ai_dir: str = "data/ai"

def get_settings(config_file=None):
    load_env_file(config_file or os.environ.get('WEATHER_CONFIG', 'config.env'))
    return Settings(os.environ.get('WEATHER_DB', 'data/weather.db'), os.environ.get('WEATHER_AI_DIR','data/ai'))
