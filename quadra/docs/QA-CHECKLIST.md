# Quadra QA checklist

This checklist is for testing the **test copy** of Quadra before real events depend on it. You do
not need to know how to code. Follow each step in order, compare what you see with the "You should
see" column, and write **Pass** or **Fail** next to it. A full run takes about 90 minutes.

## Before you start

You need:

- A laptop with Chrome, and Firefox installed for section F.
- A phone with a camera. An iPhone is needed for the Safari steps and an Android phone for the
  Chrome-on-phone steps. If the group has only one kind, write "not tested" next to the other.
- A second person for section G.
- From the owner, by private message:
  - the address of the test copy (called **the test site** below),
  - the email address the owner put on the allowlist for you (called **your test email** below),
  - an **owner** account on the test site for section C, and the news that your test email was
    invited as an admin for section B.

Three rules:

1. **Only test on the test site.** Every page of the test site has a black bar across the bottom
   that says **TEST COPY**. If you do not see that bar, stop: you are on the real site.
2. **Only use your test email.** The test site refuses to email anyone who is not on its
   allowlist, so an address that is not yours will get nothing.
3. **Make several addresses out of one.** Anything between a `+` and the `@` still arrives in your
   inbox. If your test email is `maria@gmail.com`, then `maria+a@gmail.com`, `maria+b@gmail.com`
   and so on are all yours and all allowed. The steps below call them **+a**, **+b**, **+c**
   and so on. Use each one only where its step says.

Emails from the test site have subjects that start with `[Test copy]`. Check the spam folder
before marking an email step as failed.

The test site starts with six made-up events and 23 made-up applicants. Their names end in
`(demo)` and their addresses end in `@example.test`. They exist so the pages are not empty. They
can never receive email.

The counts and names in the steps assume a freshly reset test copy. If someone tested before you,
ask the owner to reset it first. If that is not possible, expect higher counts, and where a step
names a demo applicant who is already decided, pick another pending one whose name ends in
`(demo)`.

## A. Visitor and applicant

Do these on the laptop in Chrome, signed out. Use a private window so you start clean.

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| A1 | Open the test site. | The landing page with the headline "Save your seat." and the black **TEST COPY** bar at the bottom. | |
| A2 | Scroll to "Pick a seminar, claim a seat." | Four events: Freshmen Welcome Night (demo) and Campus Tech Summit (demo) marked "Registration open", Career Fair (demo) marked "Registration closed", Hackathon Kickoff (demo) marked "Opens" with a date. Research Colloquium (demo) and Alumni Homecoming Forum (demo) are **not** listed. | |
| A3 | Click the "Open now" filter, then "All". | "Open now" leaves only the two open events. "All" brings back all four. | |
| A4 | Click Career Fair (demo). | "Registration is closed" and no form. | |
| A5 | Go back and click Hackathon Kickoff (demo). | "Registration opens" with a date, and no form. | |
| A6 | In the address bar, replace everything after the site address with `/events/research-colloquium-demo`. | The error page "We could not find that page". A draft is hidden from visitors. | |
| A7 | Click "Privacy" at the bottom of any page. | The page "What happens to your details" with the sections What we collect, Why we collect it, Who can see it, How long we keep it, Cookies and Your rights. | |
| A8 | Open Campus Tech Summit (demo). Leave every box empty and press "Apply". | Red messages under the boxes: "Full name is required.", "Email address is required.", "Organization is required.", "Contact number is required." and "Tick the box to agree before you continue." Nothing is submitted. | |
| A9 | Fill in a name, your **+a** address and an organization. Type `12345` as the contact number, tick the box, press "Apply". | "Enter a PH mobile number: 09XXXXXXXXX or +639XXXXXXXXX." The other boxes keep what you typed. | |
| A10 | Change the contact number to `0917 123 4567`. Untick the agreement box and press "Apply". | "Tick the box to agree before you continue." Nothing is submitted. | |
| A11 | Tick the box and press "Apply". | A page that says "Application received" and "Your application is under review", with a yellow box holding a private status link. There is **no** QR code. The contact number is shown as `+639171234567`. | |
| A12 | Copy the status link from the yellow box and keep it in a note. Check your inbox. | **No email.** Applying to a reviewed event sends nothing. | |
| A13 | Look at the top right of the page. Click "My registration". | The same "Application received" page. | |
| A14 | Open Campus Tech Summit (demo) again and apply a second time with the same **+a** address. | "This email is already registered for this event." No second application. | |
| A15 | Apply to Campus Tech Summit (demo) twice more, once with **+b** and once with **+c**. Keep both status links. | "Application received" both times. | |
| A16 | Open Freshmen Welcome Night (demo). Fill in the form with your **+a** address and press "Register". | Within about 15 seconds: "You're in" with a QR code, an attendee code that looks like `SEM-2026-0024`, a green box saying the ticket was emailed, and a "Download ticket" button. | |
| A17 | Press "Download ticket". | A PNG file named after your attendee code. It opens as a QR code with the code written under it. | |
| A18 | Check your inbox. | An email with the subject `[Test copy] Your ticket: Freshmen Welcome Night (demo)`. The QR code shows in the email and is also attached as a PNG. The email has a link to open the ticket again. | |
| A19 | Click the link in that email. | The same ticket page with the QR code. | |
| A20 | Register for Freshmen Welcome Night (demo) once more with the made-up address `nobody@example.org`. | The ticket page appears, with a yellow box saying "This is a test copy, so no ticket was emailed to nobody@example.org". | |
| A21 | Open the test site on your phone and repeat A1, A2 and A8. | The same results. Nothing is cut off at the sides, you never have to scroll sideways, and the **TEST COPY** bar stays at the bottom. | |

## B. Admin

Your test email was invited as an admin. Do these on the laptop in Chrome.

### Getting in

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| B1 | Find the invite in your inbox. | An email with the subject `[Test copy] You are invited to the Quadra staff team` that says the link works once and expires in 72 hours. | |
| B2 | Click the link. Type your name, and a password of 9 characters in both password boxes. Press "Save password". | "Use at least 10 characters." Nothing is saved. | |
| B3 | Type a password of 10 or more characters in the first box and a different one in the second. Press "Save password". | "The two passwords do not match." | |
| B4 | Type the same password of 10 or more characters in both boxes. Press "Save password". | The staff login page with "Your password is saved. Sign in to continue." | |
| B5 | Click the link in the invite email again. | "This link no longer works". | |
| B6 | Sign in with your test email and a **wrong** password. | "Wrong email or password." | |
| B7 | Sign in with the right password. | The check-in scanner page. The top bar shows Scanner, Admin and your name. There is **no** Team link. | |
| B8 | In the address bar, go to `/staff/team`. | The error page "This is closed to you". | |
| B9 | Click your name in the top bar. Change your password: type the current one, then a new one twice. | "Your password was changed. Your other devices were signed out." Use the new password from now on. | |

### Reviewing applications

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| B10 | Click "Admin", then the "Campus Tech Summit (demo)" pill. | The dashboard for that event. "Registered" shows 13: ten demo applicants and your three. A yellow bar says "Decision emails: 1 waiting, 1 failed". | |
| B11 | Click the "Pending" filter. | Only pending applications, including your **+a**, **+b** and **+c**. | |
| B12 | Type your **+a** address in the search box and press "Search". | Only your **+a** row. | |
| B13 | Press "Accept" on that row. | Green messages "1 accepted." and "1 email sent." The row disappears from the Pending filter. | |
| B14 | Click "Clear", then the "Accepted" filter. Find your **+a** row. | It says "accepted" with your name and the time under it, and "ticket sent". | |
| B15 | Check your inbox. | An email with the subject `[Test copy] You are accepted: Campus Tech Summit (demo)` with the QR code in the email and attached. **Keep this email. You need it in D8.** | |
| B16 | Open the **+a** status link you saved in A12. | It now says "You're in" and shows the QR code. | |
| B17 | Back on the dashboard, find your **+b** row under "Pending" and press "Decline". | "1 declined." and "1 email sent." | |
| B18 | Check your inbox. | An email with the subject `[Test copy] Your application: Campus Tech Summit (demo)`. It says a place could not be offered. It has **no** QR code and no attachment. | |
| B19 | Open the **+b** status link. | "Application declined" and no QR code. | |
| B20 | Under "Pending", tick the box next to Benjie Castillo (demo) and Carmela Javier (demo). Press "Accept selected". | "2 accepted." and a yellow message "2 held back, not sent. This test copy only emails addresses on its allowlist." | |
| B21 | Click the "Accepted" filter and find those two rows. | Each has an amber "ticket held back" label. Neither says "sent". | |
| B22 | Press "Resend email" on the Benjie Castillo (demo) row. | "The ticket for" that row's code "was held back, not sent." | |
| B23 | Press "Send next batch" in the yellow bar. | A yellow "held back" message. The yellow bar no longer counts that email as waiting. | |
| B24 | Press "Resend email" on your own **+a** row. | "Ticket for" your code "sent to" your **+a** address, and a second copy of the acceptance email arrives. | |
| B25 | Find your **+c** row under "Pending". Press "Accept", then press "Decline" on the same row under "Accepted". | "1 accepted." then "1 declined." Your inbox gets the acceptance email and then the decline email. | |
| B26 | Open the **+c** status link. | "Application declined" and no QR code. | |
| B27 | Tick the box at the very top of the table. | Every row in the list becomes ticked. Untick it again. | |
| B28 | Press "Export CSV". Open the file in a spreadsheet. | One row per applicant with the columns event_name, attendee_code, full_name, email, organization, contact_number, state, decided_at, decided_by, email_status, email_sent_at, checked_in, checked_in_at, checked_in_by, created_at, consented_at. Your **+a** row says accepted and sent, with your name under decided_by. | |

### Managing events

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| B29 | On the dashboard open "Add an event". Fill in a name that starts with your own first name, a venue, and a date next month. Leave "Registration opens" empty and "Applications" on "Review applications". Press "Save as draft". | "was saved as a draft." The new event has a pill marked "Draft". | |
| B30 | Press "Preview page". | The event page with the yellow note "Draft. Only signed-in staff can see this page until it is published." | |
| B31 | Copy that page's address. Open it in a private window where you are not signed in. | "We could not find that page". | |
| B32 | Back on the dashboard press "Publish". Reload the private window. | "is published." The private window now shows the event with an "Apply" form. | |
| B33 | Press "Edit". Change the venue, and change "Applications" to "Accept everyone automatically". Press "Save changes". | "was saved." The dashboard shows the new venue, and the hint next to the buttons says "New registrations are accepted automatically." | |
| B34 | In the private window, reload the event page and register with your **+d** address. | The form button now says "Register". You get "You're in" with a QR code at once, and the ticket email arrives. | |
| B35 | On the dashboard press "Close registration". Reload the event page in the private window. | "Registration for" your event "is closed." The page says "Registration is closed" and has no form. | |
| B36 | Open the **+d** ticket link from the email. | The ticket and QR code still show. Closing registration does not cancel tickets. | |
| B37 | Press "Reopen registration". | "follows its dates again." The form is back. | |
| B38 | Press "Edit" and set "Registration opens" to a date next week. Save, then reload the event page in the private window. | "Registration opens" with that date, and no form. Then clear the date again and save. | |
| B39 | Press "Delete" on your event. | A page saying the event has 1 registration, so it cannot be deleted. | |
| B40 | Add one more event named "Delete me" followed by your first name and press "Save as draft". Then press "Delete" on it, and "Delete this event" on the next page. | A page saying nobody has registered and the link will stop working, then "was deleted." Its pill is gone. | |
| B41 | Open the "Alumni Homecoming Forum (demo)" pill. | The pill is marked "Past". "Checked in" shows 3, and three rows show a check-in time and "Demo Reviewer" under "Checked in by". | |
| B42 | Press "Log out". Then go to `/admin` in the address bar. | The staff login page. | |

### Passwords and lockout

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| B43 | On the login page click "Forgot your password?". Type your test email and press "Email me a link". | After about 6 seconds: "If that email has a staff account, a link to set a new password is on its way." | |
| B44 | Check your inbox. | An email with the subject `[Test copy] Set a new Quadra password` that says the link expires in 1 hour. | |
| B45 | Click the link, set a new password, and sign in with it. | "Your password is saved. Sign in to continue." and the new password works. The old one does not. | |
| B46 | Use "Forgot your password?" again with `nobody@example.org`. | The same sentence as B43, after the same wait. Nothing tells you whether the account exists. | |
| B47 | Log out. Try to sign in as `locktest@example.org` with any password, five times. | "Wrong email or password." four times, then "Too many failed attempts for this email. Try again in 15 minutes." | |
| B48 | Sign in with your own email and password straight away. | It works. The lock is only for the other email. | |

## C. Owner

Sign in on the laptop with the owner account the owner gave you.

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| C1 | Look at the top bar. | A "Team" link next to Scanner and Admin. | |
| C2 | Click "Team". | A table of accounts. Demo Reviewer is "Disabled". Your admin account is "Active" with a last sign-in time. | |
| C3 | Under "Invite an admin", type your **+e** address and press "Send invite". | "An invite was sent to" that address. A new row marked "Invited" with the name "Not set yet". | |
| C4 | Check your inbox. | The invite email from B1, addressed to **+e**. Do not open the link yet. | |
| C5 | Press "Resend invite" on that row. Then click the link in the **first** invite email. | A second invite email arrives. The first link shows "This link no longer works". | |
| C6 | Click the link in the second email and set a name and password. | "Your password is saved." On the Team page the row is now "Active" with the name you chose. | |
| C7 | Invite `nobody@example.org`. | A yellow message that the invite "was held back". The row says "Invited". No email was sent. | |
| C8 | Invite your **+e** address again. | "That email already has an account." | |
| C9 | In a private window, sign in as the **+e** admin. Back in the owner window press "Disable" on the **+e** row. Then click "Admin" in the private window. | "was disabled and signed out." The private window lands on the staff login page, and signing in again gives "Wrong email or password." | |
| C10 | Press "Enable" on the **+e** row. Sign in as **+e** in the private window. | "can sign in again." The old password works. | |
| C11 | Look at your own row on the Team page. | It is marked "you" and has no Disable button. | |
| C12 | Open "Admin". | The owner can do everything from section B. Accept one pending demo applicant to confirm. | |

## D. Door staff with a phone

Sign in on the **phone** with your admin account. Have the laptop next to you, signed in to the
dashboard, with these three things ready on its screen in separate tabs:

- the **+d** ticket page from B34 (an accepted ticket, not checked in),
- the acceptance email for **+a** from B15 (accepted, not checked in),
- the acceptance email for **+c** from B25 (accepted, then declined).

### Scanning with the phone's own camera app

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| D1 | Log out on the phone. Open the phone's camera app and point it at the **+d** QR code on the laptop. Tap the link it offers. | The staff login page of the test site. | |
| D2 | Sign in. | A full green screen: "CHECKED IN:" with the name and code, the event name and the time. The **TEST COPY** bar is at the bottom. | |
| D3 | Scan the same QR code again. | A full amber screen: "ALREADY CHECKED IN at" the time from D2. The time has not changed. | |
| D4 | Scan the QR code in the **+c** email. | A full black screen: "NOT ACCEPTED:" with the name and code, and "This application was declined. Do not let this person in on this ticket." | |
| D5 | On the laptop dashboard, find the **+c** row. | No check-in time. A refused ticket is not checked in. | |
| D6 | On the phone, tap the address bar and change the last few letters of the address after `/checkin/`. | A full red screen: "INVALID TICKET". | |
| D7 | On the laptop dashboard, reload and find the **+d** row. | A check-in time and your name under "Checked in by". "Checked in" in the totals went up by one. | |

### Scanning with the scanner page

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| D8 | On the phone tap "Open scanner" or go to `/scanner`. Allow the camera when the phone asks. | A live picture from the **back** camera with a square frame, and a card that says "Ready to scan". | |
| D9 | Point the phone at the **+a** QR code on the laptop. | The card turns green: "CHECKED IN" with the name and code, and one short high beep. After 2 seconds it goes back to "Ready to scan". | |
| D10 | Point it at the same QR code again after a few seconds. | The card turns amber: "ALREADY CHECKED IN" with the first time, and one lower beep. | |
| D11 | Point it at the **+c** QR code. | The card turns black: "NOT ACCEPTED", the name, "is declined", and **three short beeps**. | |
| D12 | Point it at any other QR code, such as one on a product box. | The card turns red: "INVALID TICKET". | |
| D13 | Turn the phone sideways and back. | The camera picture and the card still fit the screen. | |
| D14 | Refuse the camera: in the phone's site settings block the camera for the test site, then reload `/scanner`. | "The camera is not available. Use the box instead." Then allow the camera again. | |
| D15 | Open `/scanner` on the laptop and allow its webcam. Hold your phone, showing the **+d** ticket page, up to the webcam. | The card turns amber: "ALREADY CHECKED IN". | |
| D16 | Only if you have a USB barcode scanner: plug it into the laptop, click the box under the card, and scan a ticket. | The same coloured card as a camera scan. If you have no scanner, write "not tested". | |

### Checking in from the dashboard

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| D17 | On the laptop dashboard for Freshmen Welcome Night (demo), find your **+a** row from A16 and press "Check in". | "checked in." The row shows the time and your name. | |
| D18 | Look at the buttons on that row, then at the `nobody@example.org` row from A20. | The checked-in row has no "Check in" button and no "Decline" button. The other row still has both. | |

## E. The test copy itself

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| E1 | Look at the bottom of the landing page, an event page, the privacy page, the login page, the dashboard, the Team page, the scanner and a check-in result screen. | The black **TEST COPY** bar on every one. It never covers a button you need: scroll down and the last line of the page is still readable above it. | |
| E2 | In the address bar go to `/robots.txt`. | Exactly two lines: `User-agent: *` and `Disallow: /`. | |
| E3 | In the address bar go to `/sitemap.xml`. | A page with no addresses in it. | |
| E4 | Search Google for the test site's address in quotes. | No result for the test site. | |
| E5 | Look back over every email you received. | Every subject starts with `[Test copy]`. Nothing arrived at an address that is not yours. | |

## F. Safari and Firefox

Repeat these steps in **Firefox on the laptop** and in **Safari on an iPhone** (and Safari on a
Mac if someone has one). Use a new **+f** style address for each browser, for example
`+firefox` and `+safari`.

| # | Do this | You should see | Pass / Fail (Firefox) | Pass / Fail (Safari) |
| --- | --- | --- | --- | --- |
| F1 | Open the test site. | The landing page looks the same as in Chrome: the frosted white panels, the maroon colours and the fonts. Nothing overlaps. | | |
| F2 | Open Freshmen Welcome Night (demo), submit the empty form, then register properly. | The red messages from A8, then the ticket page with the QR code. | | |
| F3 | Press "Download ticket". | The PNG is saved or opens. | | |
| F4 | Sign in as your admin account. | You stay signed in when you move between Scanner and Admin. | | |
| F5 | Open the dashboard and accept one pending demo applicant. | "1 accepted." and a "held back" message. | | |
| F6 | Open `/scanner` and allow the camera. Scan the ticket from F2 from another screen. | The live camera picture, then the green "CHECKED IN" card with a beep. | | |
| F7 | Scan the same ticket with the phone's camera app and open the link. | The full amber "ALREADY CHECKED IN" screen. | | |
| F8 | Log out. | The staff login page, and `/admin` asks you to sign in again. | | |

## G. Two people at once

Two testers, each on their own device, both signed in as admins, on a call or side by side. Count
down "3, 2, 1, go" and click at the same moment.

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| G1 | One of you applies to Campus Tech Summit (demo) with a new **+g1** address. Both open the dashboard, filter to "Pending", and find that row. Both press "Accept" on it at the same moment. | One of you sees "1 accepted." and "1 email sent." The other sees "0 accepted." and "1 left as they were: already accepted, or already checked in." | |
| G2 | Check the **+g1** inbox. | **One** acceptance email, not two. | |
| G3 | Both open the QR code from that email with your phone cameras and tap the link at the same moment. | One phone goes green "CHECKED IN". The other goes amber "ALREADY CHECKED IN". The dashboard shows one check-in time. | |
| G4 | Both open the Freshmen Welcome Night (demo) form and fill it in with the **same** new **+g2** address. Both press "Register" at the same moment. | One gets the ticket page. The other gets "This email is already registered for this event." The dashboard has one row for that address and one ticket email arrived. | |
| G5 | One of you applies to Campus Tech Summit (demo) with **+g3**. Both find the row. One presses "Accept" and the other presses "Decline" at the same moment. | The row ends as either accepted or declined, not both. The status link agrees with the dashboard. The last email in the **+g3** inbox matches the final state. | |
| G6 | Both open "Edit" for the event one of you created in B29. Each changes the venue to something different and presses "Save changes" at the same moment. | No error page. The dashboard shows one of the two venues, and the edit page shows who changed it last. | |

## If something unexpected happens

- **"Too many applications came from your network in the last hour."** The site allows 30
  applications an hour from one network. This is intended. Wait an hour or switch to mobile data.
- **An email did not arrive.** Check spam, then check the dashboard row. "held back" means the
  address is not on the allowlist: tell the owner the exact address. "failed" is a bug to report.
- **"Too many failed attempts for this email."** Wait 15 minutes, or use "Forgot your password?".
- **The demo data is gone or changed.** The owner may have wiped the test copy. Ask before going on.

## How to report a bug

Send the owner one message per problem with:

1. The step number, for example `B17`.
2. What you did, word for word if you typed something.
3. What you expected, copied from the "You should see" column.
4. What actually happened, with a screenshot or a screen recording.
5. Your device and browser, for example "iPhone 14, Safari" or "Windows laptop, Firefox".
6. The time it happened, so the owner can find it in the server log.

Never put a password or a full ticket link in a group chat. A ticket link lets anyone signed in
as staff check that person in, and a status link shows that person's details.

If a step in this checklist is wrong or unclear, report that too: say which step and what you saw.

## Sign-off

One row per tester per device.

| Tester | Date | Device and browser | A. Visitor | B. Admin | C. Owner | D. Door staff | E. Test copy | F. Safari and Firefox | G. Two at once | Bugs reported |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | | | |
| | | | | | | | | | | |
| | | | | | | | | | | |
| | | | | | | | | | | |
| | | | | | | | | | | |
| | | | | | | | | | | |
