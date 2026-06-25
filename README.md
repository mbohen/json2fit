# json2fit

Free local-first tool for migrating Polar Flow exports to Garmin Connect.

## What it does

- Converts Polar Flow ZIP/JSON exports to Garmin-friendly TCX/FIT files.
- Runs locally in the browser.
- Does not upload training data to any server.
- Requires no account.

## Live app

https://0x00.com.pl/tools/json2fit/

## Privacy

Your files are processed locally in your browser. The app does not require an account and does not upload Polar Flow exports, GPS tracks or workout data to a backend.

## Supported exports

- Polar Flow ZIP export
- Polar Flow JSON files
- Training sessions
- TCX/FIT export
- Experimental CSV export for daily activity and wellness reports

## How to use

1. Export your data from Polar Flow.
2. Open json2fit.
3. Select the ZIP file or JSON files.
4. Review detected activities.
5. Export TCX/FIT files.
6. Import generated files into Garmin Connect.

## Development

Use npm, as indicated by `package-lock.json`.

```bash
npm install
npm start
```

Build:

```bash
npm run build
```

Run tests:

```bash
npm run test
uv run pytest
```

## Disclaimer

This project is not affiliated with Polar, Garmin or Fitbit.

## License

MIT
