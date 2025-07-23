# Character Generation API

## Overview
Generates a character sprite-sheet and final render from **six reference images** using OpenAI GPT-4o Vision and Recraft image-to-image models.

The images are uploaded **directly to S3** from the client (browser / app) via presigned URLs.  The character-generation endpoint then receives only the public CloudFront URLs, so no image bytes ever pass through the API server.

---
## Endpoints

### 1. POST `/uploads/presign`
Returns presigned **PUT** URLs so the client can stream images straight to S3.

Authentication: JWT Bearer required

Request (JSON)
```json
{ "uuid": "550e8400-e29b-41d4-a716-446655440000", "count": 6 }
```
`count` defaults to 6 if omitted.

Response
```json
{
  "keys":   [ "<s3-key1>", … ],           // object keys inside the bucket
  "putUrls":[ "https://s3…?X-Amz…", … ],   // presigned PUT URLs (15 min expiry)
  "urls":   [ "https://cdn.example.com/<s3-key1>", … ] // public CloudFront URLs
}
```

Client workflow
1. Call `/uploads/presign` ⇒ receive arrays.
2. For each element in **`putUrls`** send:
   * `PUT <putUrl>`  (body = binary image, header `Content-Type: image/png` etc.)
3. On HTTP 200 the object is in S3 and instantly visible at the matching CloudFront URL in **`urls`**.

---
### 2. POST `/character-gen`
Starts the character-generation pipeline using the six CloudFront URLs.

Authentication: JWT Bearer required

Content-Type: `application/json`

Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| visual_prompt | string | ✓ | Character description / visual concept |
| art_style | string | ✓ | Target art style |
| uuid | string | ✓ | Same UUID used in `/uploads/presign` |
| reference_images | string[] | ✓ length 6 | The **six** CloudFront URLs returned in step 1 |
| name | string | – | Display name |
| description | string | – | Longer description |

Example
```json
{
  "visual_prompt": "A brave warrior with golden armour",
  "art_style": "fantasy digital art",
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "reference_images": [
    "https://cdn.example.com/550e8400/character-images/1.png",
    "https://cdn.example.com/550e8400/character-images/2.png",
    "https://cdn.example.com/550e8400/character-images/3.png",
    "https://cdn.example.com/550e8400/character-images/4.png",
    "https://cdn.example.com/550e8400/character-images/5.png",
    "https://cdn.example.com/550e8400/character-images/6.png"
  ],
  "name": "Golden Warrior",
  "description": "Legendary hero"
}
```

Response (immediate)
```json
{
  "success": true,
  "characterId": "cgr_123",
  "message": "Character generation in progress"
}
```
Poll `GET /character-gen/{characterId}` to retrieve sprite-sheet and final-character URLs once generation completes.

---
### 3. GET `/character-gen`
Returns all characters for the current user. Optional query params:
* `id` – specific character ID
* `projectId` – filter by project

### 4. GET `/character-gen/:id`
Returns a single character-generation record.

---
## Process Flow (backend)
1. Client uploads 6 images to S3 via presigned URLs.
2. `/character-gen` receives the six CloudFront URLs.
3. Create DB record (status “in progress”).
4. Agent 1 (OpenAI GPT-4o Vision) creates a sprite sheet.
5. Agent 2 (Recraft img2img) generates the final character.
6. Update DB record with resulting S3/CDN keys and mark `success=true`.
7. `GET /character-gen/:id` now returns the completed URLs.

---
## Error Codes
| Code | Meaning |
|------|---------|
| 400 | Invalid input (missing fields, not exactly 6 URLs) |
| 401 | Authentication required |
| 500 | Internal server error | 