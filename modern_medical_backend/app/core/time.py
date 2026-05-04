from datetime import datetime
from zoneinfo import ZoneInfo


APP_TIMEZONE = ZoneInfo("Asia/Kolkata")


def app_now() -> datetime:
    return datetime.now(APP_TIMEZONE)
