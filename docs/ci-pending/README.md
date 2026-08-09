# Workflows σε αναμονή

Αυτά τα δύο αρχεία ανήκουν στο `.github/workflows/`, αλλά το OAuth token του
`gh` δεν έχει το scope `workflow`, οπότε το GitHub απορρίπτει το push.

Ζούσαν προσωρινά στο `/tmp` — δηλαδή **θα χάνονταν στο πρώτο reboot**. Μπαίνουν
εδώ μέχρι να ξεκλειδωθεί το scope.

## Πώς ενεργοποιούνται

```bash
gh auth refresh -s workflow     # δείχνει 8ψήφιο κωδικό → github.com/login/device
mkdir -p .github/workflows
mv docs/ci-pending/*.yml .github/workflows/
git add -A && git commit -m "ci: enable checks and Pages deploy" && git push
```

| Αρχείο | Τι κάνει |
|---|---|
| `ci.yml` | Σε κάθε push: typecheck, lint, tests, build → πράσινο badge στο README |
| `pages.yml` | Μόνιμο αντίγραφο του demo στο GitHub Pages, ανεξάρτητο από το PC |
