# What to do when Garmin rejects a file

First check whether the activity has a start time, duration, trackpoints and valid timestamps.

1. Open Garmin diagnostics and choose the rejected activity.
2. Check the diagnostic checklist, critical errors, warnings, trackpoint count and GPS/HR availability.
3. Copy the diagnostic report or download the diagnostic ZIP package.
4. If FIT import failed, try TCX for the same activity.
5. If critical data is missing, leave the activity out of sport import and keep the report for analysis.

Missing GPS usually does not block import, but missing trackpoints is critical. The app reports warnings instead of filling gaps with artificial values.

The diagnostic report does not include the full GPS route by default. You can choose no GPS, rounded GPS or full GPS, but include full coordinates only deliberately.
