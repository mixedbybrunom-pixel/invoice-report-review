# Invoice Report Review

Version 1.19.0

Team site: https://ccl-invoice-report-review.netlify.app

## Run it locally

1. Copy `.env.example` to `.env` and add the Supabase project URL and publishable key.
2. Run `npm ci` from this folder.
3. Run `npm run dev` and open the local address printed in the terminal.
4. Sign in with a review-team account, upload an `.xlsx` or `.xls` report, and review the flagged invoices.

The app uses a denser default layout close to 90% browser zoom. The sign-in screen has a larger CCL logo and is titled **Sign in to CCL Report Review**. **Search accounts** in the sidebar looks up account number, customer, address, and territory in the current master file. The **Master file** button remains available to load or update the master.

Resolution reasons are grouped by issue type and draw from the stat cards: invoice number corrected or verified, zero weight confirmed, weight corrected, duplicate/conflict reviewed, territory verified or corrected, shared accounts across branches, accounts added to the master file, internal CCL accounts, repairs, redeliveries, and driver checks. **Other** requires an explanation. The same choices are available for bulk resolution. Resolving one row affects only that row, including when the report contains repeated invoice numbers.

Account search treats leading zeroes as formatting, so searching `02665` also finds the master account stored as `2665`. **Group by account** turns on every time a report is loaded; the collapsed view has separate **Account**, **Customer name**, and **Issues to fix** columns. Expand an account to see its invoice rows and invoice details. Account headings are numbered and have individual expand/collapse controls, plus **Collapse all** and **Expand all**. The checkbox switches back to the flat invoice list. Account IDs with leading zeroes group together. Table rows now show the issue selected in the filter first, with a count of any other issues on that invoice, so a Multi-driver view no longer appears to contain only Territory split records.

The **Activity** dashboard shows resolution and reopen actions for the current report, including reviewer email, reason, note, and time. The invoice detail also shows who last resolved it. Activity history is shared with the review team and retained when an invoice is reopened. Successful resolution confirmations appear at the bottom right. Dark mode uses neutral, subtle table separators and flatter row shading.

The invoice-review database is separate from the existing AurumBot project. Review decisions are shared through Supabase and protected by team membership policies.

## Invoice number rules

An invoice number is valid when it is `02xxxxxx` or `00xxxxxx` (8 digits), or `56xxxxx` (7 digits, the new series from November 2026). Five-digit numbers are repairs and `ACC-SINV` numbers are internal CCL invoices. Any other 8-digit number is flagged as suspicious, and everything else (for example `026937002`, `791750` or `0000005`) is flagged as an invalid invoice.

## Team access

An administrator can use **Add reviewer** inside the app. Enter the person’s email; the app displays a one-time temporary password to share privately. The new reviewer sets a personal password on first sign-in. This keeps regular user setup out of the Supabase dashboard.

The app provides email/password sign-in, a **Set or reset password** link on the sign-in screen, and an in-app password change action for signed-in reviewers. Password links return to the app’s current address, which must be included in Supabase Auth’s allowed redirect URLs. Accounts that are not in the membership table cannot read or change invoice reviews.

## Where review decisions are saved

Resolution status and notes are saved in the invoice-review Supabase project, shared by authorized team members, and scoped by the report contents and date range. Each row has its own resolution, so repeated invoice numbers can be resolved independently. Re-uploading the same report restores its decisions. The master file continues to load from the project’s existing master-data service; a master spreadsheet can also be used for the current session.

## Quick checks

Run these from the project folder:

```sh
npm run typecheck
npm run lint
npm run build
```

Then start the app and check the review flow:

1. Upload a report and resolve an invoice with a note.
2. Refresh the page, upload the same report, and confirm its resolution is still there.
3. Change a row in the report and upload the edited report; it should have a separate review state.
4. Sign in from another authorized browser profile and confirm the saved resolution is shared.


## What's new in 1.19.0

- **Drop shipments need a confirmation every time**: a row is a drop shipment when its account is marked as drop-ship, or when the Details or customer name say drop ship (also catches spellings like dropshp, drp ship, drop-shipment). Any territory is accepted, but the row stays in "Needs action" until someone confirms it with "Drop shipment confirmed".
- **Mark account as drop-ship (admin)**: a button in the invoice panel marks the account in the master file, so it is recognised next time. Needs the upload key.
- Unknown accounts are still checked on drop-ship rows.

## What's new in 1.18.0
- **Team updates card**: when a teammate resolves or reopens an invoice on the same report, a card stays at the bottom-left until you close it. Later fixes are added to it. Your own actions only show a small confirmation.
- **Admin-only master file controls**: only the admin sees "Manage master file", the Update master tab and the Push-to-master buttons. Reviewers can still search accounts. The upload key remains the real lock on the server.
- **Manage accounts** (admin): list, search, edit and delete master accounts, with Backup and Undo.
- **Drop shipments**: rows are treated as drop shipments when the Details or customer name mention "drop ship", or the account is ticked "Drop-ship account" in Manage accounts. They skip territory/driver checks (unknown account is still checked) and appear under "Drop shipments" in the sidebar. New resolution reason: "Drop shipment confirmed".
- **Stat cards removed**; use the left menu.
