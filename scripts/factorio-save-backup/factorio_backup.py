import shutil
import os
from datetime import datetime

SAVE_LOC = "/home/tyler/factorio/saves/_autosave.zip"
BACKUP_DIR = "/mnt/sda/Factorio"


backups = os.listdir(BACKUP_DIR)

shutil.copy(SAVE_LOC, f'{BACKUP_DIR}/{datetime.strftime(datetime.now(), "%Y%m%d_%H%M%S")}.zip')


if len(backups) > 5:
    for backup in sorted(backups)[:len(backups)-5]:
        print(f'Deleting {backup}...')
        os.remove(f'{BACKUP_DIR}/{backup}')