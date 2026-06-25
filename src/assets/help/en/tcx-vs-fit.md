# How to choose TCX or FIT

TCX is readable XML and a good fallback. FIT is smaller and closer to Garmin, but local export is still experimental.

1. Choose TCX when you want a stable text file that is easy to diagnose.
2. Choose FIT when you want Garmin's binary format and local validation does not show errors.
3. If you migrate many activities, download the TCX + FIT package and start import with FIT.
4. If Garmin rejects FIT, try TCX and check the Garmin-ready report.

The app does not invent trackpoints, GPS or heart-rate data. Garmin Connect may reject a file even when local structure validation passes.
