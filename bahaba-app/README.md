# BAHABA

## Real authentication setup

Authentication uses the PHP API in `api/` and MySQL. Signup accepts only `@gmail.com` addresses, hashes passwords on the server, and sends a 24-hour activation link through Gmail SMTP.

1. Install MySQL/MariaDB and import `api/schema.sql`.
2. Edit `api/config.php`: set the database password and Gmail SMTP values. For Gmail, use a Google **App Password**, not your normal Gmail password.
3. Install the mail dependency from `bahaba-app` with `composer install --working-dir=api`.
4. Start the PHP API from `bahaba-app` with `php -S localhost:8000`.
5. In a second terminal, start the React app with `npm run dev`.

The default frontend/API URLs are `http://localhost:5173` and `http://localhost:8000/api`. Change `VITE_API_URL` if the API runs elsewhere.

Do not commit `api/config.php`; it is already ignored because it contains SMTP credentials.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
