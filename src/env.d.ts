// CSS imports: bundled by Bun in the SPAs; imported `with { type: "text" }` as a string on the server.
declare module "*.css" {
  const text: string;
  export default text;
}
// The favicon, served as text by server.ts.
declare module "*.svg" {
  const text: string;
  export default text;
}
