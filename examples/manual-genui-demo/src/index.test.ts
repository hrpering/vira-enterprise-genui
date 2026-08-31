import { describe, expect, it } from "vitest";
import {
  buildManualGoldenAirlinePublication,
  manualGoldenAirlineDocument,
} from "./index.js";

describe("manual GenUI golden consumer", () => {
  it("builds the full golden journey without opening Experience Studio", () => {
    expect(manualGoldenAirlineDocument.views).toHaveLength(9);
    const publication = buildManualGoldenAirlinePublication();
    expect(publication).toMatchObject({
      ok: true,
      value: {
        id: "demo.golden.airline.booking",
        document: { entryView: "search" },
      },
    });
  });
});
