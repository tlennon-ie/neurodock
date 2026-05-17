# translation/meetings/

Examples for the `brief_meeting` tool. Each example carries an `input`
matching `BriefMeetingInput` (a transcript, the rater's `me` handle, and
optional speakers/project) and an `expected` block over my_asks /
others_asks / decisions / ambiguous_items counts and salient fields.

Per ADR 0005 §5, every `ambiguous_items[*].quoted_span` is verbatim-anchored.
The runner exercises that invariant on every meeting example.
