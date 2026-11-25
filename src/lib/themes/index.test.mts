import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { constrain, constraintNotesPt, getThemeById, HOUSE_THEMES, resolveTheme } from "./index.ts";
import { getAllRuleSets, getRuleSet, HOUSE_RULE_SET_ID } from "../formatting/ruleSet.ts";
import { buildRuleSetCss, buildThemeAccentCss, resolveChoices } from "../formatting/styles.ts";
import { COVER_TEMPLATES, coverBaseCss } from "../covers/templates.ts";
import { coverTokensFor } from "../covers/merge.ts";

const NON_BLACK_HEX = /#(?!0{3}\b|0{6}\b)[0-9a-f]{3,6}\b/i;

describe("house themes (DIO-56)", () => {
  test("at least two themes with unique ids, one serif and one sans", () => {
    assert.ok(HOUSE_THEMES.length >= 2);
    assert.equal(new Set(HOUSE_THEMES.map((theme) => theme.id)).size, HOUSE_THEMES.length);
    const families = new Set(HOUSE_THEMES.map((theme) => theme.bodyFamily));
    assert.ok(families.has("Times New Roman") && families.has("Arial"));
  });

  test("an unknown or unset id falls back to the default theme", () => {
    assert.equal(resolveTheme(undefined).id, HOUSE_THEMES[0].id);
    assert.equal(resolveTheme("nope").id, HOUSE_THEMES[0].id);
    assert.equal(getThemeById("nope"), undefined);
  });

  test("MFR degrades every theme to strict: black, the norm's default font, no display face", () => {
    const mfr = getRuleSet("mfr");
    for (const theme of HOUSE_THEMES) {
      const effective = constrain(theme, mfr);
      assert.equal(effective.mode, "strict");
      assert.equal(effective.accent, "#000000");
      assert.equal(effective.accentTint, null);
      assert.equal(effective.bodyFamily, mfr.font.family.default, "DIO-46: no font choice where the norms name one");
      assert.equal(effective.displayFamily, effective.bodyFamily, "Q2a: no display face");
      assert.equal(effective.displayItalic, false);
      assert.equal(effective.colourCover, false);
      assert.equal(effective.freeTypeScale, false);
    }
  });

  test("Pediatria keeps Verdana everywhere but may use colour (silent on colour and cover)", () => {
    const pediatria = getRuleSet("pediatria");
    for (const theme of HOUSE_THEMES) {
      const effective = constrain(theme, pediatria);
      assert.equal(effective.mode, "expressive");
      assert.equal(effective.bodyFamily, "Verdana");
      assert.equal(effective.displayFamily, "Verdana");
      assert.equal(effective.colourCover, true);
      assert.equal(effective.freeTypeScale, false);
    }
  });

  test("the house standard applies the theme in full", () => {
    const house = getRuleSet(HOUSE_RULE_SET_ID);
    for (const theme of HOUSE_THEMES) {
      const effective = constrain(theme, house);
      assert.equal(effective.mode, "expressive");
      assert.equal(effective.bodyFamily, theme.bodyFamily);
      assert.equal(effective.displayFamily, theme.displayFamily);
      assert.equal(effective.accent, theme.accent);
      assert.equal(effective.colourCover, true);
    }
  });

  test("an explicit font option wins only where the profile allows it", () => {
    assert.equal(constrain(HOUSE_THEMES[0], getRuleSet("mfr"), { fontFamily: "Arial" }).bodyFamily, "Arial");
    assert.equal(constrain(HOUSE_THEMES[0], getRuleSet("mfr"), { fontFamily: "Verdana" }).bodyFamily, "Times New Roman");
  });

  test("strict mode emits no colour in headings, tables or covers", () => {
    const mfr = getRuleSet("mfr");
    for (const theme of HOUSE_THEMES) {
      const effective = constrain(theme, mfr);
      assert.equal(buildThemeAccentCss(effective), "");
      const tokens = coverTokensFor(effective);
      for (const cover of COVER_TEMPLATES) {
        const css = `${coverBaseCss(tokens)}\n${cover.css(tokens)}`;
        assert.doesNotMatch(css, NON_BLACK_HEX, `${theme.id} × ${cover.id}`);
        assert.doesNotMatch(css, /background:/, `${theme.id} × ${cover.id}: no fields in strict mode`);
      }
    }
  });

  test("the house standard colours headings and table headers with the theme's accent", () => {
    const house = getRuleSet(HOUSE_RULE_SET_ID);
    for (const theme of HOUSE_THEMES) {
      const effective = constrain(theme, house);
      const css = buildRuleSetCss(house, resolveChoices(house, { fontFamily: effective.bodyFamily }), effective);
      assert.ok(css.includes(`h1, h2 { color: ${theme.accent}; }`), theme.id);
      assert.ok(css.includes(`background: ${theme.accent}`), theme.id);
    }
  });

  test("the picker explains each constraint the profile imposes", () => {
    assert.equal(constraintNotesPt(getRuleSet(HOUSE_RULE_SET_ID)).length, 0);
    assert.equal(constraintNotesPt(getRuleSet("mfr")).length, 2);
    assert.equal(constraintNotesPt(getRuleSet("pediatria")).length, 1);
  });

  test("every theme × profile resolves to a font the profile allows", () => {
    for (const ruleSet of getAllRuleSets()) {
      for (const theme of HOUSE_THEMES) {
        const effective = constrain(theme, ruleSet);
        assert.ok(ruleSet.font.family.options.includes(effective.bodyFamily), `${theme.id} × ${ruleSet.id}`);
      }
    }
  });
});
