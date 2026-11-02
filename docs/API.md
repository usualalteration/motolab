# API Reference

All endpoints are OpenServerless web actions under package `v1`, reachable at
`/api/my/v1/<action>` through the Vite dev proxy. Protected endpoints require:

```
Authorization: Bearer <opaque-session-token>
```

## Response envelope

Every endpoint returns:

```json
{ "success": true, "data": {}, "error": null }
```

On error: `{"success": false, "data": null, "error": "<message>"}`.

The generated wrapper nests module output as `{"body": <envelope>}`; OpenWhisk
serves `body` as the HTTP response, so the browser receives the envelope directly.

---

## Authentication

### POST `/api/my/v1/register`

```json
// request
{ "email": "rider@example.com", "password": "supersecret", "name": "Rider" }
// response
{ "success": true, "data": { "token": "abc...", "user": { "id": 1, "email": "...", "name": "...", "createdAt": "..." } }, "error": null }
```

### POST `/api/my/v1/login`

```json
{ "email": "rider@example.com", "password": "supersecret" }
```
Returns the same `{ token, user }` shape as register.

### GET `/api/my/v1/me`  (protected)

Returns `{ data: { user: {...} } }`.

### POST `/api/my/v1/logout`  (protected)

Deletes the Redis session record. Returns `{ data: { loggedOut: true } }`.

---

## Motorcycles

### GET `/api/my/v1/motorcycles`  (protected)

Returns the caller's garage: `data: Motorcycle[]`.

### GET `/api/my/v1/motorcycles/{id}`  (protected)

Returns a single motorcycle (ownership-checked).

### POST `/api/my/v1/motorcycles`

```json
{ "brand": "Yamaha", "model": "MT-07", "year": 2021,
  "engineDisplacement": 689, "currentMileage": 12500,
  "registrationDate": "2021-05-01", "vin": "JYARM...", "notes": "", "photoUrl": null }
```

### PUT `/api/my/v1/motorcycles/{id}`

Partial update with any of the motorcycle fields.

### DELETE `/api/my/v1/motorcycles/{id}`

Cascades to maintenance, components, and document associations.

---

## Maintenance

### GET `/api/my/v1/maintenance?motorcycleId={id}`  (protected)

Returns `MaintenanceRecord[]` ordered by operation date desc.

### POST `/api/my/v1/maintenance`

```json
{ "motorcycleId": 1, "category": "engine_oil", "operationDate": "2026-10-15",
  "mileage": 12000, "cost": 85.50, "notes": "Motul 7100 10W-40" }
```
Categories: `engine_oil | oil_filter | air_filter | spark_plugs | brakes |
brake_fluid | chain | sprockets | tires | battery | coolant | general_inspection | other`

### PUT `/api/my/v1/maintenance/{id}`  ·  DELETE `/api/my/v1/maintenance/{id}`

---

## Components

### GET `/api/my/v1/components?motorcycleId={id}`  (protected)

### POST `/api/my/v1/components`

```json
{ "motorcycleId": 1, "name": "Front Brake Pads", "category": "brakes",
  "installationMileage": 10000, "expectedMaintenanceInterval": 15000 }
```

### PUT `/api/my/v1/components/{id}`  ·  DELETE `/api/my/v1/components/{id}`

---

## Documents (S3)

### POST `/api/my/v1/documents` — `action: "upload-url"`

```json
{ "action": "upload-url", "motorcycleId": 1, "filename": "receipt.pdf", "contentType": "application/pdf" }
// → { "uploadUrl": "https://...presigned...", "s3Key": "docs/<uid>/<mid>/<uuid>_receipt.pdf", "contentType": "..." }
```
The browser then `PUT`s the file directly to `uploadUrl` with the matching
`Content-Type` header.

### POST `/api/my/v1/documents` — `action: "confirm"`

```json
{ "action": "confirm", "motorcycleId": 1, "s3Key": "docs/...", "filename": "receipt.pdf", "contentType": "application/pdf", "docType": "receipt" }
```
The action `head_object`s the key to verify the upload, then stores metadata.
Returns the `DocFile` record.

### GET `/api/my/v1/documents?motorcycleId={id}`  (protected)

Lists documents for a motorcycle.

### GET `/api/my/v1/documents/{id}`  (protected)

Returns `{ downloadUrl, document }` with a fresh presigned GET URL.

### DELETE `/api/my/v1/documents/{id}`

Deletes metadata and the S3 object.

---

## Dashboard

### POST `/api/my/v1/dashboard`  (protected)

```json
{ "motorcycleId": 1 }   // optional; defaults to the most recent motorcycle
```

Returns the aggregated overview: selected motorcycle, stats, recent maintenance,
upcoming maintenance (from schedules), and component status.
