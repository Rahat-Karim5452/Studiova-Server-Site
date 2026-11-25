# StudioSpace Server

Express + MongoDB server for StudioSpace.

Protected routes read the token from the `Authorization: Bearer <token>` header. The token is
created by BetterAuth in the client. The server checks it with `jose` using the public keys at
`CLIENT_URL/api/auth/jwks`. No valid token = `401 Unauthorized!`.

## Local setup

```bash
npm install
```

Create `.env`:

```bash
MONGODB_URI=<your MongoDB connection string>
CLIENT_URL=http://localhost:3000
```

```bash
npm run dev
```

Demo data: import `creative_spaces.json` into the `creative_spaces` collection (MongoDB Compass or Atlas).

Server: http://localhost:8000

## Database

- Database: `studiospace_db`
- Collections: `creative_spaces`, `reservations`

## Routes

| Method | Route                              | Who can use it                                          |
| ------ | ---------------------------------- | ------------------------------------------------------- |
| GET    | `/studios?search=&category=&sort=` | Everyone                                                |
| GET    | `/featured-studios`                | Everyone (6 studios)                                    |
| GET    | `/studio/:id`                      | Everyone                                                |
| POST   | `/add-studio`                      | Logged in user                                          |
| GET    | `/my-studios/:email`               | Logged in user, own email only                          |
| PATCH  | `/studio/:id`                      | Host of the studio                                      |
| DELETE | `/studio/:id`                      | Host of the studio                                      |
| POST   | `/booking`                         | Logged in user. 409 on overlap with a confirmed booking |
| GET    | `/my-bookings/:email`              | Logged in user, own email only                          |
| PATCH  | `/my-bookings/:id/cancel`          | Creator, pending bookings only                          |
| GET    | `/host-bookings/:email`            | Logged in user, own email only                          |
| PATCH  | `/booking/:id/status`              | Host of the studio                                      |

## Deploy

Deploy on Vercel (`vercel.json` included). Add `MONGODB_URI` and `CLIENT_URL` in Vercel settings.
