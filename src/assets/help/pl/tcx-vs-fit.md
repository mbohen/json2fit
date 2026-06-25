# Jak wybrać TCX czy FIT?

TCX jest czytelnym XML-em i dobrym fallbackiem. FIT jest mniejszy i bliższy Garminowi, ale eksport lokalny ma status eksperymentalny.

1. Wybierz TCX, jeśli chcesz stabilny, tekstowy plik łatwy do diagnostyki.
2. Wybierz FIT, jeśli zależy Ci na binarnym formacie Garmina i lokalna walidacja nie pokazuje błędów.
3. Jeśli migrujesz dużo aktywności, pobierz pakiet TCX + FIT i zacznij import od FIT.
4. Gdy Garmin odrzuci FIT, spróbuj TCX i sprawdź raport Garmin-ready.

Aplikacja nie dopisuje fałszywych trackpointów, GPS ani tętna. Garmin Connect może odrzucić plik mimo lokalnej walidacji struktury.
