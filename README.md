# Study Planner

Study Planner is a web application for keeping track of coursework and planning study sessions. Students can record what needs to be done, set deadlines and priorities, and update their progress. Each account has its own records.

This project was developed for IA730001 Advanced Application Development Concepts. It uses React with Vite for the interface, Express for the API, and MongoDB for storage. Progressive Web App (PWA) support lets users reopen the interface and read previously loaded records when their connection is unavailable.

## What you can do

- Create, view, edit and delete coursework tasks, including their course, due date, priority, status and notes.
- Plan study sessions with a start time and duration, then mark them as completed. Sessions also support full CRUD.
- Register and sign in to a private account. The server checks ownership whenever a record is requested or changed.
- Read saved tasks and sessions offline. Changes become available again when the connection returns.
- Enable browser notifications and send a test Web Push message from the interface or through the API.

## How it works

The React interface sends HTTPS requests to the Express API. The server checks the user's identity and validates the submitted fields before reading or changing MongoDB records. The same validation schemas are used in the interface and API. For example, a study session must last between 15 and 240 minutes.

A service worker caches the interface files in `study-planner-shell-v1`. Personal records are stored separately in IndexedDB as snapshots for the signed-in user. API responses are excluded from the service worker cache. An online logout clears the snapshots and invalidates the user's existing JWTs.

Web Push starts when the user grants notification permission. The browser retrieves the public VAPID key from `/api/push/key`, creates a subscription and sends it to the backend. The server keeps the matching private key and uses it to authenticate outgoing push messages. When a message reaches the browser, the service worker asks the operating system to display it. Both the website and the operating system must allow notifications; a successful API send alone does not confirm that a banner appeared.

## Start locally

Requires Node.js 22.12+ (Node 24 LTS recommended), npm, OpenSSL and MongoDB Community (`mongod`). Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm run setup
npm run db
```

Keep MongoDB running. In a second terminal:

```sh
npm run build
npm start
```

Open **https://localhost:3443**. Trust the generated `.local/localhost.pem` certificate in your local certificate store before PWA/push verification. See [the short Russian project explanation](docs/Объяснение-проекта.docx) for setup, requirements and verification. Never commit `.env`, `.local`, private certificates or database files.

Development: `npm run dev` serves Vite at https://localhost:5173 and the API at https://localhost:3443. Service worker registration is enabled in the production build only. Use `npm start` for offline and push evidence.

## Verification

Verification completed: 60 unit tests passed; the 41-request Postman collection passed 48 assertions through Newman with certificate verification enabled. Browser checks covered CRUD, validation, offline reload, reconnection, logout cleanup and real external Web Push reception. Evidence screenshots are embedded in the Word report. See [the short Russian Postman checklist](docs/Postman-коротко.md).

```sh
npm test
npm run test:coverage
```

Import [the Postman collection](postman/Study-Planner.postman_collection.json). It contains 41 requests including CRUD for both resources, token revocation, ownership checks, validation, Push API and optional admin checks. Use fresh test emails on repeat runs. Pause before real push and enable notifications while signed into the browser as student A. Cookie sending is disabled in the collection so negative bearer-token tests stay deterministic.

## Design and report

[Figma screens, persona and storyboard](https://www.figma.com/design/GmSiHa0dFd99jjPhkLVAqh). The persona is a fictional design assumption, not research. UML diagrams are embedded in the report. The English Word report starts with the supplied coversheet and includes actual screenshots and measured results. Fill your personal coversheet fields and GitHub URL before submission.

## Architecture

- `src/client`: React UI, API client, IndexedDB snapshot adapter and service worker.
- `src/shared/validation.js`: strict Zod schemas reused by the frontend and backend.
- `src/server`: HTTP composition, authentication, resource services, owner-scoped repository and encrypted push adapter.
- `src/tests`: service, HTTP, IndexedDB and React component tests.
- `src/scripts`: repeatable setup, local database, admin provisioning, Postman generation and safe submission packaging.

Browser JWTs use a Secure HttpOnly SameSite=Strict cookie. Postman uses the JWT returned by login as a Bearer token. Logout increments tokenVersion and removes subscriptions. Passwords use bcrypt; subscriptions are encrypted at rest using AES-256-GCM. Public registration always creates a student. An administrator sees only aggregate totals and cannot read another user's personal records.

## Create a separate administrator

Use a new email and your own password of at least 10 characters. Read the password silently instead of writing it in shell history:

```sh
read -s 'ADMIN_PASSWORD?Admin password: '
export ADMIN_PASSWORD
npm run admin -- --email admin.aad@example.com --name Administrator
unset ADMIN_PASSWORD
```

This syntax is for zsh on macOS. Start the local database first. The CLI refuses to overwrite an existing account.

## Scope

Offline mode reads previously loaded records in the same browser tab session. It does not permit offline login, queue writes or resolve conflicts. Closing the tab removes the remembered identity. Offline snapshots remain on the device until an online logout clears them; use a trusted device. Push messages are sent on demand; there is no automatic reminder scheduler. A successful send means acceptance by the external push service, not proof of display on the device. Internet access, browser permission and OS notification settings still affect delivery. MongoDB replication and cloud scaling are optional extensions and are not implemented.

## Submission

Fill your personal coversheet fields and GitHub URL, then (Python 3 is required for ZIP packaging):

```sh
npm run package -- StudentID Name
```

The generated `artifacts/StudentID-Name.zip` includes source, configuration examples, report and Postman collection. It excludes secrets, dependencies, local MongoDB data and build output. All implementation code is under `src`.
