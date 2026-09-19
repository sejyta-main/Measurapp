# Measurapp

An installable, privacy-first mobile measurement toolkit.

## Tools

- Digital inclinometer and bubble level using device sensors
- Camera/photo measurement using a known reference object
- Unit converter for length, area, volume, mass, temperature and angle
- Saved measurements with local-only storage
- Offline PWA support

Run locally with `python3 -m http.server 4173`. Camera and sensors need HTTPS outside localhost.

The included GitHub Actions workflow deploys to GitHub Pages. In repository settings, select **GitHub Actions** as the Pages source.

Sensor accuracy depends on the device. Camera measurements are estimates: keep the reference and target on the same plane and avoid perspective distortion.
