# Content rating answers — NeuroDock

This file collects the answers the human submitter should give to each
store's content-rating questionnaire. Be honest. The questionnaires are
the gate that determines which regional storefronts the listing shows
in; lying to widen distribution backfires when a reviewer catches it.

The default position across all three stores is **lowest possible
restriction**: the extension contains no content of its own. It accepts
arbitrary user input (the text the user selects to translate) but does
not store, share, or surface that input to anyone except the LLM
provider the user explicitly configured.

---

## Microsoft IARC (Edge Add-ons)

Edge runs every listing through the IARC questionnaire. The IARC
result feeds PEGI, ESRB, USK, ClassInd, and Australian Classification
ratings automatically.

| Question                                                               | Answer | Notes                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the product contain or facilitate gambling?                       | **No** |                                                                                                                                                                                                                                 |
| Does the product contain or facilitate violence?                       | **No** |                                                                                                                                                                                                                                 |
| Does the product contain sexual content or nudity?                     | **No** |                                                                                                                                                                                                                                 |
| Does the product contain profanity or crude humour?                    | **No** | The extension contains none. User-supplied text the user chooses to translate is not "contained" content.                                                                                                                       |
| Does the product depict the use of controlled substances?              | **No** |                                                                                                                                                                                                                                 |
| Does the product contain content that may scare or disturb children?   | **No** |                                                                                                                                                                                                                                 |
| Does the product contain political or religious content?               | **No** |                                                                                                                                                                                                                                 |
| Does the product allow users to interact with other users?             | **No** | The extension has no social surface. Each install is isolated to the user's own browser.                                                                                                                                        |
| Does the product share users' personal information with third parties? | **No** | The extension does not share personal information. When the user enables cloud mode and clicks translate, the user transmits the selected text to the provider they configured; that is the user's action, not the extension's. |
| Does the product share users' location with other users?               | **No** | The extension does not read location.                                                                                                                                                                                           |
| Does the product enable users to purchase digital goods?               | **No** |                                                                                                                                                                                                                                 |
| Does the product include unrestricted internet access?                 | **No** | Host permissions are a closed list of seven sites. Optional localhost permission is opt-in.                                                                                                                                     |
| Does the product include user-generated content sharing?               | **No** | Nothing leaves the device unless the user explicitly sends it to their own configured provider.                                                                                                                                 |

**Expected IARC outcome:** PEGI 3 / ESRB Everyone / IARC 3+ / USK 0.

**Fallback if reviewer pushes back:** if the Edge reviewer requires a
higher rating on the grounds that the extension processes free-form
user-supplied text (a common bump-up for productivity tools), accept
**PEGI 12 / ESRB Everyone 10+ / IARC 12+** rather than arguing. The
underlying audience is adult professionals regardless of the formal
rating.

---

## Chrome Web Store maturity

Chrome's maturity selector has two values: **Mature** and **Not
Mature**. Default settings hide Mature listings from accounts that have
not opted into adult content.

| Selector       | Pick           |
| -------------- | -------------- |
| Maturity level | **Not Mature** |

**Why Not Mature:** the extension itself contains no mature content. It
does not host, link to, surface, or generate adult content. The free-form
text the user chooses to translate is not "content the extension
provides"; it is user input the extension processes. Selecting Mature
because users could theoretically translate adult text would be the same
mistake as marking a calculator Mature because users could compute taxes
on adult content.

---

## Firefox Add-ons (AMO)

AMO's "Is this add-on appropriate for all ages?" toggle.

| Question                                 | Answer  |
| ---------------------------------------- | ------- |
| Is this add-on appropriate for all ages? | **Yes** |

AMO also asks separately whether the add-on requires a paid account or
external service. Answer:

| Question                                                                            | Answer                                                                                                      |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Does this add-on require a paid account or third-party service to function?         | **No, but optional cloud LLM providers (OpenRouter, Anthropic, OpenAI) work with a user-supplied API key.** |
| Does this add-on need an API key, login credentials, or token to be fully reviewed? | **No.** Mock mode requires no key and exercises every code path the reviewer needs to see.                  |

---

## On the question of "the extension translates messages, so users might translate profanity"

Three stores will likely raise this. The honest answer is the same in all
three places, paste-ready:

> The extension contains no profanity. It does not generate text on its
> own initiative. It processes text the user selects, and only when the
> user invokes the translate action. The text the user selects is not
> stored, retained, or shared by the extension; in cloud mode it is sent
> directly from the user's browser to the LLM provider the user
> configured, with no NeuroDock-side server in the loop.
>
> Treating the extension as containing mature content because users could
> select profane text to translate would be inconsistent with how
> spellcheckers, dictionaries, and translation tools are rated. We
> request the same treatment.

If a reviewer is unmoved, accept the higher rating. It does not change
how the extension is built.
