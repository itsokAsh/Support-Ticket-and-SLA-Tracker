/**
 * Lightweight resolver type definition.
 *
 * This is intentionally loose at the scaffold phase — a precise
 * code-generated type (e.g. from graphql-codegen) is overkill for
 * a schema-first project of this size. The real type safety comes
 * from the service layer and Prisma types.
 */
export interface Resolvers {
  [typeName: string]: {
    [fieldName: string]: unknown;
  } | undefined;
}
