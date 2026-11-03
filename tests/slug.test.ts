import { expect, test } from "bun:test";
import { slugify } from "../src/shared/slug.ts";

test("slugify transliterates Polish characters", () => {
  expect(slugify("Żółć Gęślą Jaźń: Łódź!")).toBe("zolc-gesla-jazn-lodz");
  expect(slugify("Sesja D&D — one-shot")).toBe("sesja-d-d-one-shot");
  expect(slugify("!!!")).toBe("event");
});
