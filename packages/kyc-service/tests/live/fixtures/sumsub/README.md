# Sumsub sandbox document templates

`germany-passport.jpg` is Sumsub's own sandbox template (an accepted German
passport), published for testing at
<https://sumsub.com/files/29346237-germany-passport.jpg> and listed in
<https://docs.sumsub.com/docs/verification-document-templates>. The sandbox
recognises it by its exact bytes and auto-fills the document data; anything
re-saved, converted, cropped or compressed is processed as an ordinary photo
instead. So: committed byte for byte (SHA-256
`4246fd0a6053fb879de025f216edef2593cb6f779c1faefe9adcf6c5305bbfc7`), never
edited, `binary` in `.gitattributes`.

Used only by `tests/live/sumsub-submission.live.test.ts` (the real-submission
half of `make e2e-live`); it never reaches the packages or the built service.
