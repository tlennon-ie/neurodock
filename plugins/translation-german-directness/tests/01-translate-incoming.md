# Test 01 — Literal-translate flow over a German email containing scoped critique

**Scenario:** User (an Anglophone working with a German engineering team) receives an email containing scoped critique, a formal imperative, an agenda redirection, and a formal closure. The pack's `literal_meaning.md` prompt must surface all four signals, preserve the scoped nature of the critique, and explicitly NOT infer hostility.

## Given

Profile:

```yaml
identity:
  neurotypes: []
locale: en-GB
plugins:
  translation-german-directness:
    enabled: true
```

`mcp-translation` is mocked with the pack installed and the base prompts shadowed by the pack's overrides. The reference client passes through `domain: german-directness` to the server.

## User prompt

The user passes the following German email into `translate_incoming`:

> Sehr geehrter Herr Lennon,
>
> vielen Dank für den Entwurf. Das ist so nicht akzeptabel — der Abschnitt zur Datenverarbeitung muss präzisiert werden. Bitte beachten Sie die Anforderungen aus dem letzten Termin; das übrige Dokument können wir wie besprochen übernehmen. Die Diskussion zum Vertragsumfang gehört nicht zur Tagesordnung dieses Reviews; ich erwarte Ihre Rückmeldung bis Freitag, 17:00 Uhr.
>
> Mit freundlichen Grüßen,
> Anna Müller

## Expected pack effect

The output must contain:

1. **`explicit_ask`** is populated (NOT null). It paraphrases: "Revise the data-processing section per the requirements discussed in the previous Termin. Reply by Friday 17:00. The rest of the document is approved as discussed. Contract-scope discussion belongs in a different forum, not this review."

2. **`ambiguity.spans`** contains entries for at least:

   - "Das ist so nicht akzeptabel" — the `note` matches the phrasebook entry's `literal` (scoped critique to a specific element, not sweeping rejection).
   - "Bitte beachten Sie" — `note` from the phrasebook (formal-imperative; "please note" is not optional).
   - "gehört nicht zur Tagesordnung" — `note` from the phrasebook (redirection to the right forum, not dismissal).
   - "ich erwarte Ihre Rückmeldung bis Freitag" — `note` from the phrasebook (formal deadline-setting; standard register).
   - "Mit freundlichen Grüßen" — `note` from the phrasebook (conventional formal close; NOT cold).

3. **`register_calibration`** contains:

   - `directness_signals`: includes "Das ist so nicht akzeptabel" and "ich erwarte Ihre Rückmeldung."
   - `cultural_baseline_notes`: includes at least one note explaining that scoped critique is a professional courtesy in target register, and at least one explaining that the formal closure is the default and is not cold.

4. **`likely_subtext`** is SHORT (≤ 2 entries) and high-confidence only. At most:

   - A hypothesis from the phrasebook noting that the data-processing section is the specific element flagged; the rest of the document is implicitly approved.

5. **`recommended_next_action.action`** is `reply`. `reason` references the explicit Friday 17:00 deadline and the specific revision required (data-processing section).

## Pass criteria specific to this test

- The output describes "das ist so nicht akzeptabel" as scoped critique (one section needs revision), NOT as sweeping rejection of the document.
- The output does NOT contain words like "blunt," "harsh," "rude," "cold," "aggressive," or "harsh" applied to the sender or to the email.
- The output does NOT generalise to "Germans" or pan-German framing.
- The output does NOT flatten "Mit freundlichen Grüßen" into a cold-sounding equivalent; the note explicitly calls out that it is the standard formal close.
- `likely_subtext` is sparse — the test asserts no more than 2 entries, reflecting that the German workplace register conventionally puts substance on the surface.
- Universal pack pass criteria (see `README.md`) all hold.
