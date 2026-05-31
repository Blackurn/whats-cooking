# Express Server Spec

## Requirement: Server starts and listens on port 3000
The server SHALL start with `npm start` and listen on port 3000.

### Scenario: Server boot
- **WHEN** `npm start` is run
- **THEN** the process listens on port 3000 and logs a ready message

## Requirement: Server serves the client statically
The server SHALL serve files from `src/client/` at the root URL path.

### Scenario: Client files accessible
- **WHEN** a GET request is made to `/`
- **THEN** the server returns `src/client/index.html` with status 200

## Requirement: POST /api/recipe route exists
The server SHALL expose POST `/api/recipe` accepting `{ ingredients, serves }`.

### Scenario: Route responds during stub phase
- **WHEN** a POST request is sent to `/api/recipe` with a JSON body
- **THEN** the server responds with status 501 and a JSON body `{ "message": "Not yet implemented" }`

## Requirement: POST /api/rewrite route exists
The server SHALL expose POST `/api/rewrite` accepting `{ recipe, instruction }`.

### Scenario: Route responds during stub phase
- **WHEN** a POST request is sent to `/api/rewrite` with a JSON body
- **THEN** the server responds with status 501 and a JSON body `{ "message": "Not yet implemented" }`

## Requirement: POST /api/substitute route exists
The server SHALL expose POST `/api/substitute` accepting `{ ingredient, recipe }`.

### Scenario: Route responds during stub phase
- **WHEN** a POST request is sent to `/api/substitute` with a JSON body
- **THEN** the server responds with status 501 and a JSON body `{ "message": "Not yet implemented" }`

## Requirement: Server parses JSON request bodies
The server SHALL parse `application/json` request bodies and make them available on `req.body`.

### Scenario: JSON body parsed
- **WHEN** a POST request is sent with `Content-Type: application/json`
- **THEN** `req.body` contains the parsed JSON object
