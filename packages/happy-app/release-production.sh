set -e
pnpm dlx eas-cli@latest build --profile production --platform ios --auto-submit-with-profile=production --no-wait --non-interactive
pnpm dlx eas-cli@latest build --profile production --platform android --auto-submit-with-profile=production --no-wait --non-interactive
