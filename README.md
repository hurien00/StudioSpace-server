# StudioSpace — Server

Express + MongoDB API for **StudioSpace**, the peer-to-peer creative workspace marketplace.

- **Live API:** https://studio-space-backend-two.vercel.app
- **Client:** https://studio-space-bice.vercel.app
- **Client repository:** https://github.com/hurien00/StudioSpace

## What it does

- Exposes public studio read endpoints and protected studio/bookings mutations.
- Verifies `Authorization: Bearer <jwt>` tokens with `jose` against the Next.js Better Auth JWKS at `${CLIENT_URL}/api/auth/jwks`.
- Returns `401 Unauthorized` for missing or invalid tokens.
- Enforces ownership on studio update/delete and booking cancellation.
- Rejects overlapping bookings for the same studio, date and time range with `409`.
- Stores JWT in the HTTPOnly `studio_token` cookie as a secondary transport; the browser uses the Bearer header.

## Tech stack

Node.js, Express 5, MongoDB, Better Auth (MongoDB adapter), `jose`, CORS.

## Local setup

```bash
git clone https://github.com/hurien00/StudioSpace-server.git
cd StudioSpace-server
npm install
cp .env.example .env
npm start
```

Environment variables:

```env
PORT=8000
BETTER_AUTH_URL=http://localhost:8000
BETTER_AUTH_SECRET=<same secret as the client>
MONGODB_URI=mongodb+srv://...
CLIENT_URL=http://localhost:3000
```

`CLIENT_URL` accepts a comma-separated list, so preview deployments can be allowed too.

## API routes

| Method | Route | Auth |
| --- | --- | --- |
| GET | `/` | Public health check |
| GET | `/api/studios` | Public |
| GET | `/api/studios/featured` | Public |
| GET | `/api/studios/:id` | Public |
| GET | `/api/studios/my-listings` | Bearer JWT |
| POST | `/api/studios` | Bearer JWT |
| PUT | `/api/studios/:id` | Bearer JWT + owner |
| DELETE | `/api/studios/:id` | Bearer JWT + owner |
| POST | `/api/bookings` | Bearer JWT + overlap check |
| GET | `/api/bookings` | Bearer JWT |
| PATCH | `/api/bookings/:id/cancel` | Bearer JWT + owner |

## Deploy on Vercel

The repository includes `vercel.json` and `api/index.js`, so it can be imported as a standalone Vercel project. Add the environment variables above, set `CLIENT_URL` to the deployed frontend URL, and deploy.
