set -e
pnpm dlx eas-cli@latest build --profile development --platform ios --no-wait --non-interactive
pnpm dlx eas-cli@latest build --profile development --platform android --no-wait --non-interactive
pnpm dlx eas-cli@latest build --profile preview --platform ios --no-wait --non-interactive
pnpm dlx eas-cli@latest build --profile preview --platform android --no-wait --non-interactive
pnpm dlx eas-cli@latest build --profile development-store --platform ios --auto-submit-with-profile=production --no-wait --non-interactive
pnpm dlx eas-cli@latest build --profile preview-store --platform ios --auto-submit-with-profile=production --no-wait --non-interactive
