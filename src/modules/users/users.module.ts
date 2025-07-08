/**
 * Feature Module Directory Structure
 * Each feature module should follow this structure:
 *
 * /module-name/
 * ├── dto/           # Data Transfer Objects
 * │   ├── create.dto.ts
 * │   └── update.dto.ts
 * ├── entities/      # Database entities/models
 * │   └── entity.ts
 * ├── interfaces/    # Module specific interfaces
 * │   └── interface.ts
 * ├── module.ts      # Module definition
 * ├── controller.ts  # Route handlers
 * ├── service.ts     # Business logic
 * └── repository.ts  # Data access layer (optional)
 *
 * Example modules:
 * - users/      (User management)
 * - auth/       (Authentication)
 * - products/   (Product catalog)
 * - orders/     (Order processing)
 * - payments/   (Payment handling)
 */
