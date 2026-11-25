# PENTA QA checklist

This checklist is for testing PENTA by hand before it is shown or handed in. You do not need to
know how to code. Follow each step in order, compare what you see with the "You should see"
column, and write **Pass** or **Fail** next to it.

Every section is done twice: once in the light theme and once in the dark theme. One theme takes
about three hours. A full run of both themes takes about six hours.

## Before you start

You need:

- A laptop with Chrome. Firefox or Safari is useful for a second opinion but is not required.
- Two browser windows that do not share a sign-in: one normal window and one private window. The
  steps call them the **teacher window** and the **student window**.
- A running copy of PENTA with the demo data. On your own machine, start the local stack as the
  README describes, then run `npm run demo:reset` and `npm run dev`, and open
  `http://localhost:3000`. If the owner gives you a deployed address instead, use that address
  and the accounts the owner gives you in place of the ones below.
- The teacher signup code. The owner keeps it in the `TEACHER_SIGNUP_CODE` setting. Ask the owner
  for it by private message.
- These files on your laptop:
  - a PDF with several pages, 50 MB or less, to use as a deck,
  - a PowerPoint file (`.pptx`) and the same slides exported to PDF,
  - a small PDF and a small Word file (`.docx`) to hand in,
  - a file of another kind, for example a `.txt` note or a `.jpg` photo,
  - a copy of the `.txt` note renamed so that its name ends in `.pdf`,
  - a PDF larger than 25 MB, for example a long scanned document,
  - a PNG or JPG picture of 2 MB or less.

The demo data that exists after `npm run demo:reset`:

| Account | Name | Role |
| --- | --- | --- |
| `teacher@penta.local` | Maria Santos | teacher |
| `student1@penta.local` | Ana Reyes | student |
| `student2@penta.local` | Ben Cruz | student |
| `student3@penta.local` | Carla Dizon | student |

The password for every demo account is `penta-local-2026`.

- Two classes, both taught by Maria Santos, with all three students enrolled: **INTE 301, Systems
  Integration and Architecture 1** (empty) and **COMP 018, Database Administration** (everything
  below is in this class).
- Modules **Week 1 · Foundations** and **Week 2 · Backups**. Published lessons: **What a database
  administrator does**, **Roles and privileges**, **Logical backups with pg_dump**. One draft
  lesson: **Point in time recovery**.
- Decks: **Roles and privileges: slides** (PDF, 12 slides, linked to the lesson Roles and
  privileges) and **Backup strategies** (PowerPoint and PDF, 6 slides).
- Quizzes: **Roles and privileges check** (published, 5 questions, 15 minutes, 2 attempts, needs
  the deck Roles and privileges: slides, answers shown after the due date) and **Backups check**
  (draft).
- Upload activities: **Access review essay** (20 points, due in 5 days) and **Backup plan**
  (10 points, due 2 days ago).
- Threads: **Why does a role need usage on a schema?** on the lesson Roles and privileges, with
  one hidden post, and **Is the quiz timed?** on the quiz Roles and privileges check, locked.
- Ana Reyes has finished the first lesson, seen all 12 slides of Roles and privileges: slides,
  scored 4 of 5 on the quiz, and has a graded essay (17 of 20). Ben Cruz has an essay that is not
  graded yet and a late Backup plan. Carla Dizon has handed in nothing.

Four rules:

1. **Reset before each theme.** Run `npm run demo:reset` before the light run and again before
   the dark run. The steps assume a fresh reset. If you cannot reset, ask the owner to do it.
2. **Do the sections in order.** Later sections use things made in earlier ones, such as the
   student account from section A.
3. **Write down addresses when a step says so.** Section K needs them.
4. **Times are shown in Manila time.** Dates and times in "You should see" are examples of the
   shape, not the exact value.

## Light and dark

Do these four steps first. Then run sections A to M in the light theme, reset, switch to dark and
run sections A to M again. Print the checklist twice, or write both results in each Pass / Fail cell,
for example "light pass, dark fail".

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| T1 | Open the site in a new private window. | The light theme: a pale paper background with dark text. This is the theme a new visitor gets, even when the computer itself is set to dark. | |
| T2 | Press the button marked "dark" in the top bar. | The background turns maroon and the text turns light. The button now says "light". Nothing moves: every heading, card and button stays in the same place and keeps its size and its words. | |
| T3 | Reload the page. Then open the Log in page. | The dark theme stays after the reload and on the next page. There is no flash of the light theme while the page loads. | |
| T4 | Press "light". | The paper background returns and the button says "dark" again. | |

What must be the same in both themes: the layout, the wording, the order of things on the page,
and what every button does. What changes: the background and text colours, and the picture of the
building on the landing page. In either theme all text must be easy to read against its
background, including text on cards, chips, buttons, form fields and error messages. Mark a step
as failed if something is unreadable or missing in one theme only.

The theme button is in the top bar of every page: the landing page, Log in, Sign up, and every
page after you sign in.

## A. Visitor

Use the student window, signed out.

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| A1 | Open the site. | The landing page with the headline "Learn at Penta", the button "Start climb", and a top bar with the "Penta" tag, the theme button and "Log in". No sign-in is needed. | |
| A2 | Scroll down slowly with the mouse wheel or trackpad. | The section "Three layers. One building." stays on screen while three plates drop into a stack one at a time: Routes, then Decks, then Ops. The page moves by exactly as much as you scroll and never fights the wheel. | |
| A3 | Watch the left side while you scroll through the stack. | Three pills, "01 Routes", "02 Decks" and "03 Ops", open in step with the plates. The counter reads "Layer 01 / 03 · Routes", then 02 with Decks, then 03 with Ops. | |
| A4 | Click the pill "01 Routes". | The page scrolls back to the point where the Routes plate has landed, and the counter shows 01. | |
| A5 | Reload the page while you are in the middle of the stack. | The plates that had already dropped are still in place and the same pill is open. | |
| A6 | Keep scrolling past the stack. | Three full-screen panels, Routes, Decks and Ops, each marked "Sample data". Each new panel slides over the one before it, and the covered panel shrinks a little and dims. | |
| A7 | Scroll to the very bottom. | The footer with "Built for focus", "Made for height", "Forged by practice" and the link "Log in with school email". | |
| A8 | Switch the theme with the button in the top bar, then scroll from top to bottom again. | Steps A1 to A7 look and behave the same. The building picture behind the headline changes to match the theme. Switch back to the theme you are testing. | |
| A9 | Only if you can: turn on "Reduce motion" in the settings of your computer, reload the landing page and scroll through it. Turn the setting off afterwards. | Nothing slides or shrinks. The plates do not fall, the panels do not shrink or dim, and the building picture does not drift. All the text is still there. If you cannot change the setting, write "not tested". | |
| A10 | Press "Log in" in the top bar. | The page "Log in" with the boxes "School email" and "Password" and the line "New to PENTA? Sign up". | |
| A11 | Click "Sign up". Fill in "Full name" with `QA Student`, "School email" with `qa.student@penta.local` and a password of 8 or more characters. Leave "Teacher code" empty. Press "Sign up". | The hub. The headline says "You're at 0 m". The top bar shows QA Student and the label "student", with the links "Classes" and "Grades". The Routes panel says "No classes yet". | |
| A12 | Press "Sign out". | The Log in page. | |
| A13 | Click "Sign up". Fill in `QA Teacher`, `qa.teacher@penta.local` and a password. Type `wrong-code` in "Teacher code". Press "Sign up". | "That teacher code is not valid" under the Teacher code box. You are still on Sign up, and the name and email are still filled in. No account is made. | |
| A14 | Replace the teacher code with the real one from the owner. Press "Sign up". | The hub. The headline says "You teach 0 classes". The top bar shows QA Teacher and the label "teacher". There is a "Classes" link and no "Grades" link. | |
| A15 | Press "Sign out". On Log in, type `teacher@penta.local` and a wrong password. Press "Log in". | "Email or password is incorrect". The email is still filled in. | |
| A16 | Type the right password, `penta-local-2026`. Press "Log in". | The hub. The headline says "You teach 2 classes" and the top bar shows Maria Santos. | |
| A17 | In the address bar, replace everything after the site address with `/login`. | You are sent back to the hub. A signed-in person does not see the Log in page. | |
| A18 | Press "Sign out". | The Log in page. | |

## B. Student, Routes

Teacher window: log in as `teacher@penta.local`. Student window: log in as
`qa.student@penta.local`, the account from A11.

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| B1 | Teacher window: click "Classes", then "Database Administration". Scroll to "Join code". | A code in the shape `XXXXX-XXXXX` and the line "Students enter this code on their Classes page. It changes when you remove a student." Write the code down. | |
| B2 | Student window: click "Classes". | The page "Your classes" with a "Join code" box and the hint "10 characters, for example K7M2P-9XQ4T. Hyphens and spaces are fine." | |
| B3 | Type `ABC` and press "Join class". | "A join code has 10 letters and numbers." You are still on the page. | |
| B4 | Type `AAAAA-AAAAA` and press "Join class". Do this once only: five wrong codes lock joining for 15 minutes. | "That code does not match a class. Check it with your teacher." | |
| B5 | Type the real code from B1 in small letters and without the hyphen. Press "Join class". | The class page "Database Administration" with Teacher "Maria Santos", "Joined on" today's date and "0 of 3 lessons done". The join code is not shown anywhere on this page. | |
| B6 | Teacher window: reload the class page and scroll to "Roster". | QA Student is in the table with today's date, and the label says "4 students". | |
| B7 | Student window: sign out and log in as `student1@penta.local`. | The hub for Ana Reyes. The headline says "You're at" followed by a number of meters. Write the number down. The labels say "Hub", "student" and "2 classes". | |
| B8 | Look at the Routes panel on the hub. | A card "Continue where you left off" that points to the lesson "Roles and privileges". A card for COMP 018 that says "Lesson 1 / 3" and a card for INTE 301. | |
| B9 | Click the COMP 018 card. | The class page. "1 of 3 lessons done". Module 01 "Week 1 · Foundations" lists "What a database administrator does" marked "Done" and "Roles and privileges" marked "To do". Module 02 "Week 2 · Backups" lists "Logical backups with pg_dump" marked "To do". "Point in time recovery" is **not** listed. | |
| B10 | Click "Roles and privileges". | The lesson with the labels "Week 1 · Foundations", "15 min" and "Lesson 2 of 3", a bullet list, a block of SQL code and a link to the PostgreSQL manual. Under the text: "Slides for this lesson" with the deck "Roles and privileges: slides". At the bottom: "Previous" and "Next" links to the neighbouring lessons. | |
| B11 | Press "Mark as done". | "Marked as done." A "Done" chip appears, the button now says "Mark as not done", and the line under it says "2 of 3 lessons done". | |
| B12 | Press "Mark as not done", then "Mark as done" again. | "Marked as not done." and "1 of 3 lessons done", then "Marked as done." and "2 of 3 lessons done". | |
| B13 | Click "Back to the class". | "2 of 3 lessons done" and "Roles and privileges" is now marked "Done". | |
| B14 | Click the "Penta" tag in the top bar to open the hub. | The number of meters in the headline is higher than the one you wrote down in B7. The COMP 018 card says "Lesson 2 / 3". The "Continue where you left off" card now points to "Logical backups with pg_dump". | |

## C. Student, Decks

Student window: Ana Reyes. Teacher window: Maria Santos.

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| C1 | Student window: open the class Database Administration and scroll to "Decks". | "2 decks": "Roles and privileges: slides" and "Backup strategies". | |
| C2 | Click "Backup strategies". | The deck page with the labels "Layer 02 · Decks" and "PPTX", the first slide, and "Slide 1 / 6". After about one second, "Viewed 1 / 6". The "Previous slide" arrow is greyed out. | |
| C3 | Press the "Next slide" arrow. Wait a second. | "Slide 2 / 6", then "Viewed 2 / 6". | |
| C4 | Click once on the slide, then press the Right Arrow key, then the Left Arrow key. | The slide moves forward one, then back one. | |
| C5 | Press the End key, then the Home key. | "Slide 6 / 6" with the "Next slide" arrow greyed out, then "Slide 1 / 6". | |
| C6 | In the strip of markers between the two arrows, click the fourth marker. | "Slide 4 / 6". The fourth marker is the highlighted one. | |
| C7 | Click "Download PPTX". | A PowerPoint file is downloaded and opens. | |
| C8 | Click "Back to the class". | The card for Backup strategies shows how many of its 6 slides you have viewed. | |
| C9 | Open "Roles and privileges: slides". | The label "PDF", "Slide 1 / 12" and "Viewed 12 / 12". The link says "Download PDF". | |
| C10 | Student window: open "Backup strategies" again and leave it open. Teacher window: open the class, scroll to "Decks", click "Backup strategies" and press "Present". | Teacher window: a "Live" chip, "No students following yet" and the button "End session". | |
| C11 | Student window: wait, without reloading. This can take up to 40 seconds. | A "Live" bar appears: "Your teacher is presenting this deck. Slide 1 now." with the button "Join live". | |
| C12 | Student window: press "Join live". | "Live · you follow the teacher" and the button "Browse freely". Within about 15 seconds the teacher window says "1 student following". | |
| C13 | Teacher window: press "Next slide" twice, a second apart. | The student window moves to slide 2 and then slide 3, each within a second or two, without being touched. | |
| C14 | Student window: press "Browse freely", then "Previous slide". Teacher window: press "Next slide". | The student stays on the slide they chose. The bar says "You are browsing on your own. The teacher is on slide 4." and the button says "Jump back". | |
| C15 | Student window: press "Jump back". | The student is on slide 4 again, with the button "Browse freely". | |
| C16 | Student window: open the hub in a new tab. Then open the class page. | Hub: a "Live" chip with a "Join live" link under the headline, and "Live now" on the Decks panel. Class page: "Live now: Backup strategies. Open it and press Join live." | |
| C17 | Teacher window: press "End session". | Teacher window: the "Present" button is back. Student window: within a few seconds the "Live" bar is gone and the arrows work as before. | |

## D. Student, Ops

Student window: Ana Reyes, then Ben Cruz where a step says so.

### Taking a quiz

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| D1 | Open the class Database Administration and scroll to "Ops". | Three activities: "Roles and privileges check" with the chip "Graded · 4 of 5", "Access review essay" and "Backup plan". The draft quiz "Backups check" is **not** listed. | |
| D2 | Click "Roles and privileges check". | "Points: 5", a due date that ends in "Manila time", "Time limit: 15 minutes", "Attempts: 1 of 2 used" and "The quiz closes at the due time even if your timer has not run out." Under "Your attempts": "Attempt 1: 4 of 5 (80%)" with a "Best" chip. The button "Start quiz". No question is shown yet. | |
| D3 | Click "See attempt 1". | "You scored 4 of 5", "80%" and "Attempt 1". The line "Answers are shown after the due time" with the date. Each question shows "Your answer:" and what was answered, with **no** "Correct", "Incorrect" or "Correct answer". Also "You can try again. Start another attempt from the quiz overview." | |
| D4 | Click "Back to quiz overview" and press "Start quiz". | The quiz paper marked "Attempt 2", a "Time left" clock counting down from about 15:00, and five questions starting with "Question 1 (1 point)". | |
| D5 | In question 1 choose "GRANT". In question 5 type `REVOKE` and click somewhere else on the page. | Near the "Submit quiz" button the words "Saving" and then "Saved". | |
| D6 | Reload the page. | "GRANT" is still chosen and `REVOKE` is still typed. The clock has kept running. It did not start again from 15:00. | |
| D7 | Click inside the answer box of question 5 and press Enter. | Nothing is submitted. | |
| D8 | Answer question 2 "SELECT", question 3 "True" and question 4 "False". Press "Submit quiz". | "You scored 5 of 5", "100%" and "Attempt 2". The answers are still not marked right or wrong, because the due date has not passed. | |
| D9 | Click "Back to quiz overview". | "Attempts: 2 of 2 used", "You have no attempts left." and no "Start quiz" button. Attempt 2 has the "Best" chip. | |
| D10 | Go back to the class page. | The chip on "Roles and privileges check" says "Graded · 5 of 5". | |
| D11 | Sign out and log in as `student2@penta.local`. Open the class and click "Roles and privileges check". | A card "Finish this deck to unlock" with "Viewed 0 / 12". There is no "Start quiz" button. | |
| D12 | Click that card, then move through all 12 slides, staying about one second on each, until you see "Viewed 12 / 12". Go back to the quiz. | The "Start quiz" button is now there. | |
| D13 | Only if you have 15 minutes: press "Start quiz", answer one question and then leave the page open without submitting. | Messages "10 minutes left.", "5 minutes left." and "1 minute left." as the clock runs down. At 00:00, "Time is up. Submitting your answers." and then the result page on its own. If you skip this, write "not tested". | |

### Handing in a file

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| D14 | Sign out and log in as `student1@penta.local`. Open the class and click "Backup plan". | "Points: 10", a due date two days ago and "One file, PDF or DOCX, 25 MB or less." Under "Your work": "Missing" and "Nothing handed in. You can still hand in a file." Also "The due time has passed. Your file will be marked late." | |
| D15 | Drag your `.txt` or `.jpg` file onto the box "Your file". | "Error: Choose a file that ends in .pdf or .docx." | |
| D16 | Choose the PDF that is larger than 25 MB. | "Error: That file is larger than 25 MB." | |
| D17 | Choose the note that you renamed to end in `.pdf`. Press "Hand in". | "That file is not a PDF. Export it again and retry." Under "Your work" it still says "Missing". | |
| D18 | Choose your small PDF. | "Chosen file:" with the name and size of the file. | |
| D19 | Press "Hand in". | "Handed in". Under "Your work": the file name, "Handed in" with the time, a chip "Late by 2 days" and the link "Open file". | |
| D20 | Click "Open file". | Your PDF opens or downloads. | |
| D21 | Look at the form again. | The button now says "Replace file", with the note "The new file replaces the old one. Your teacher sees only the latest." | |
| D22 | Choose your small Word file and press "Replace file". | "File replaced". The file name under "Your work" is now the Word file. | |
| D23 | Go back to the class and click "Access review essay". | The chip "Graded" and "17 of 20". Under "Your grade": "Score 17 of 20", "Feedback" with the text that starts "Clear tables and a sensible split", and "Graded" with a time. The line "This work is graded, so the file cannot be replaced." There is no "Hand in" or "Replace file" button. | |
| D24 | Click "Grades" in the top bar. | The page "Grades" with three sections: "Altitude" with a meter and one row per class, "My upcoming deadlines", and a table "Your scores in this class" for each class with a "Class total" line. | |
| D25 | Read the Database Administration table. | "Access review essay" shows 17 of 20 and "Graded". "Roles and privileges check" shows 5 of 5. "Backup plan" shows "Not graded" and "Late". Under the tables: "Missing work counts as zero. Work that is handed in but not graded is left out of totals until it is graded." | |

## E. Student, Threads

Student window: Ana Reyes. For E5 you also need Ben Cruz: use a second private window in another
browser, or sign out and in again in the same window.

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| E1 | Open the lesson "Roles and privileges" and scroll to "Questions". | The question "Why does a role need usage on a schema?" by Ana Reyes, and the button "Ask a question". | |
| E2 | Click the question. | The thread. Your own post has the mark "You". The answer by Maria Santos has the mark "Teacher". Under it is a reply by Ben Cruz. The post that says "Just give the role superuser and stop asking, it is faster." is **not** shown. At the bottom: "Something wrong? Tell your teacher." | |
| E3 | Look at your question, which was posted about 50 minutes ago. | It has no "Edit" button. | |
| E4 | Go back to the lesson. Press "Ask a question". Fill in "Question title" with `QA question` and "Your question" with a sentence. Press "Post question". | A new thread page with the heading "QA question" and your sentence as the first post. Write down the address of this page. | |
| E5 | As Ben Cruz, open the lesson "Roles and privileges", click "QA question", type in "Your answer" and press "Post answer". Keep Ana's window on the thread without reloading. | Ben sees his answer at once. Ana's window shows it within a few seconds, without a reload. | |
| E6 | As Ana, press "Reply" under Ben's answer, type in "Your reply" and press "Post reply". | The reply appears indented under Ben's answer. Replies have no "Reply" button of their own. | |
| E7 | Press "Edit" on the reply you just posted. | A box "Edit your post" with the line "You can edit for 15 minutes, up to 3 times." Posts by other people have no "Edit" button. | |
| E8 | Change the text and press "Save edit". | The new text, with the word "edited" next to the time. | |
| E9 | Edit the same reply two more times. | After the third saved edit the "Edit" button is gone from that reply. | |
| E10 | Wait one minute. Then post six short answers to "QA question", one after another, as fast as you can. | The first five are posted. The sixth gives "You are posting too fast. Wait a minute and try again." and the text you typed is still in the box. | |
| E11 | Open the quiz "Roles and privileges check" from the class page and scroll to "Questions". | The question "Is the quiz timed?" with a "Locked" chip. | |
| E12 | Click it. | The thread with a "Locked" chip and the line "This thread is locked." There is no answer box, no "Reply" button and no "Edit" button. | |
| E13 | Go to the class page and scroll to "Questions in this class". | All the questions of the class, newest first, each with who asked it, what it is on, the number of replies and the time. | |

## F. Teacher, Routes

Teacher window: Maria Santos. Student window: `qa.student@penta.local` for F16.

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| F1 | Click "Classes". | "Your classes" with INTE 301 and COMP 018. The COMP 018 card says "3 published · 1 draft". Below: the form "Create a class". | |
| F2 | Fill in "Course code" with `QA 101` and "Title" with `QA class`. Leave Section and Term empty. Press "Create class". | The class page "QA class" with "No modules yet. Add the first module.", "No decks yet. Upload the first one.", "No activities yet. Create a quiz or an upload activity.", a join code, and "No students yet. Share the join code." | |
| F3 | Type `Week 1` in "New module title" and press "Add module". | "Module added". A block "Module 01" with the title Week 1 and "No lessons in this module yet." | |
| F4 | Add a second module, `Week 2`. | "Module 02" under the first. On Week 1 the "Move up" button is greyed out. On Week 2 the "Move down" button is greyed out. | |
| F5 | Press "Move up" on Week 2. Then press "Move down" on it. | "Moved" each time. Week 2 becomes Module 01, then goes back to Module 02. | |
| F6 | In Week 1, change "Module title" to `Week 1 start` and press "Save". | "Module renamed" and the new title in the heading. | |
| F7 | In Week 1, type `First lesson` in "New lesson title" and press "Add lesson". | The page "Edit lesson" with a "Draft" chip, the boxes "Title", "Minutes to read" and "Body", and an empty "Preview" that says "Nothing to preview yet. Write in the body field." | |
| F8 | In "Body" type `# Hello`, an empty line, and a sentence with one word between two pairs of stars, like `**this**`. | The Preview shows "Hello" as a heading and the starred word in bold, while you type. | |
| F9 | Set "Minutes to read" to 5 and press "Save". | "Saved". | |
| F10 | Press "Publish". | "Lesson published. Students can read it now." The chip says "Published" and the button says "Unpublish". | |
| F11 | Click "Open the lesson as a student sees it". | The lesson with a note "Preview. Students see this lesson." and a link "Edit lesson". There is no "Mark as done" button for a teacher. | |
| F12 | Go back to the class. Add a lesson `Second lesson` to Week 1, then go back to the class again. | Under Week 1: "First lesson" with "Published" and "5 min", then "Second lesson" with "Draft". | |
| F13 | Press "Move up" on Second lesson. | "Moved" and Second lesson is now first. | |
| F14 | Press "Unpublish" on First lesson, then "Publish" on it. | "Lesson unpublished. Students no longer see it." and the chip "Draft", then "Lesson published. Students can read it now." and the chip "Published". | |
| F15 | Press "Delete" on Second lesson. Press "Delete module" on Week 1. Press "Delete module" on Week 2. | "Lesson deleted". Then, for Week 1, which still has a lesson: "Delete or unpublish its lessons first. A module with lessons cannot be deleted." Then, for the empty Week 2: "Module deleted". | |
| F16 | Open the class Database Administration and scroll to "Roster". Press "Remove" on the row for QA Student. | "Student removed. The join code changed." The label says "3 students" and the join code is different from the one in B1. | |
| F17 | Student window, as QA Student: open the hub. | "No classes yet". Database Administration is gone from Classes too. | |

## G. Teacher, Decks

Teacher window: Maria Santos, on the class page of Database Administration. Student window:
Ana Reyes.

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| G1 | Scroll to "Decks". | A line "Deck storage:" with an amount "of 700 MB used", and the two demo decks: "Roles and privileges: slides" with "12 slides · PDF" and "Backup strategies" with "6 slides · PPTX". | |
| G2 | In the form "Upload a deck", press "Upload deck" with nothing filled in. | "Enter a deck title". Nothing is uploaded. | |
| G3 | Type `QA deck` in "Deck title". Drag your `.txt` or `.docx` file onto "Slides as PDF". | "Error: Choose a file that ends in .pdf." | |
| G4 | Choose the note that you renamed to end in `.pdf`. Press "Upload deck". | "Error: This PDF could not be opened. Export it again and retry." The list still has two decks. | |
| G5 | Choose your real PDF in "Slides as PDF". Leave "Link to a lesson" on "No lesson". Press "Upload deck". | "Checking the PDF", then "Uploading" with a percentage, then "Deck uploaded". "QA deck" is in the list with the right number of slides and "PDF". | |
| G6 | Upload a second deck: title `QA deck with PowerPoint`, the PDF export in "Slides as PDF" and the `.pptx` file in "PowerPoint original". | After you choose the PowerPoint file, a button "Remove the PowerPoint file" appears. After the upload: "Deck uploaded" and the new row says "PPTX". | |
| G7 | Click "QA deck with PowerPoint". | The slides are shown from the PDF. The label says "PPTX" and the link says "Download PPTX". Clicking it downloads the PowerPoint file. | |
| G8 | Back on the class page, in the row for QA deck, choose "Logical backups with pg_dump" under "Link to a lesson" and press "Save". | "Lesson link saved". | |
| G9 | Student window: open the lesson "Logical backups with pg_dump". | "Slides for this lesson" shows QA deck. | |
| G10 | Teacher window: in the row for QA deck, choose "Point in time recovery (Draft)" and press "Save". | "Lesson link saved" and the note "Students see this deck after the lesson is published." | |
| G11 | Student window: reload the class page. | QA deck is **not** in the Decks list. | |
| G12 | Teacher window: set the lesson of QA deck back to "No lesson" and press "Save". | "Lesson link removed". The student sees QA deck again after a reload. | |
| G13 | Teacher window: click "QA deck" and press "Present". Student window: open QA deck and press "Join live" when it appears. | The same behaviour as C10 to C13: the student follows the teacher's slide, and the teacher sees "1 student following". | |
| G14 | Teacher window: open the hub in a new tab. | A "Live" chip under the headline with the link "Open the presenter view". | |
| G15 | Teacher window: go back to the deck and press "End session". | The "Present" button is back and the student's "Live" bar goes away. | |
| G16 | On the class page, press "Delete" on "Roles and privileges: slides". | "A quiz requires this deck. Remove the requirement first." The deck is still in the list. | |
| G17 | Press "Delete" on "QA deck". | "Deck deleted" and the row is gone. Student window: after a reload the deck is gone from the class page. | |

## H. Teacher, slide editor

Teacher window: Maria Santos, on the class page of Database Administration. Use a window at least
900 pixels wide until H22.

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| H1 | In the form "Make a deck in PENTA", type `QA slides` in "New deck title" and press "New deck". | The editor, with the heading "QA slides", the labels "Layer 02 · Decks", "Editor" and "Draft", and the line "Only you can see this deck. Publish it to show it to the class and present it." On the left: one slide and "1 of 60 slides". Write down the address of this page. | |
| H2 | Student window, as Ana Reyes: reload the class page. | "QA slides" is **not** in the Decks list. | |
| H3 | Under "Layout" choose "Title" and press "Add slide". Do the same for "Title and text", "Two columns" and "Three-box diagram". | Four new slides, each added after the one that was selected, each with a different arrangement of blocks. "5 of 60 slides". The thumbnails are numbered "01" to "05". | |
| H4 | Click the thumbnail of the Three-box diagram slide. Before clicking anything on the big slide, read the toolbar. | The big slide shows three boxes joined by arrows. The toolbar says "Select a block to change it." | |
| H5 | Click one of the boxes. | The box gets an outline with four corner handles. The toolbar shows "Box", a row "Fill" with None, Ink, Parchment, Cream, Maroon and Gold, and the button "Delete block". | |
| H6 | Drag the box to another place. Then drag one of its corner handles. | The box moves with the mouse, then changes size. It stays where you drop it. | |
| H7 | With the box still selected, press the Right Arrow key a few times. Then hold Shift and press it. Then hold Alt (Option on a Mac) and press it. | The box moves right in steps. With Shift the steps are much smaller. With Alt the box gets wider instead of moving. | |
| H8 | Click the thumbnail of the slide made with the "Title" layout. Double-click its title, "Message queues". Type a new title and press Enter. | A text box opens in place over the title. After Enter the slide and its thumbnail show the new title. | |
| H9 | Select a text block on the "Title and text" slide, press Enter, type two lines with Enter between them, then press Escape. | Enter starts a new line inside a text block. Escape closes the box and keeps the text. | |
| H10 | Under "Add", press "Title", "Text", "Box" and "Arrow" in turn. | Each press adds one block of that kind to the slide. Selecting the arrow shows a row "Direction" with Right, Left, Up and Down. Selecting a title or text shows a row "Tone" with Ink and Maroon. | |
| H11 | Choose "Gold" for a box, "Up" for the arrow and "Maroon" for a title. Then select a second box on the same slide. | Each block changes at once on the slide and on its thumbnail. For the second box, "Gold" is greyed out: a slide can have one gold box. | |
| H12 | Press "Image" and choose your PNG or JPG. | "Adding image", then the picture appears on the slide as a block. With it selected, the toolbar shows a "Description" box. | |
| H13 | Select a block and press "Delete block". Select another and press the Delete key. | Both blocks are removed. | |
| H14 | Press "Undo" twice, then "Redo" once. | The two deleted blocks come back one at a time, then one of them is removed again. | |
| H15 | Select a block, move it with an arrow key, then press Ctrl+Z (Cmd+Z on a Mac), then Ctrl+Shift+Z (Cmd+Shift+Z). | The move is undone, then done again. | |
| H16 | In the slide list press "Duplicate slide 2", "Move slide 1 down" and then "Delete slide 6". Hover over the small buttons to read their names. | A copy of slide 2 appears right after it. The first slide swaps places with the second. The last slide is removed. The count under "Add slide" is right each time. | |
| H17 | Watch the status next to the buttons at the top while you move a block, then stop. | "Not saved yet", then "Saving", then "Saved", within about two seconds of your last change. | |
| H18 | Reload the page. | Every change is still there. | |
| H19 | Open the address from H1 in a second tab. In the second tab move a block and wait for "Saved". Go back to the first tab and move a block there. | In the first tab: "This deck changed elsewhere." with the buttons "Keep mine" and "Reload". Nothing is overwritten without asking. | |
| H20 | Press "Reload" in the first tab. Close the second tab. | The first tab shows the deck as the second tab saved it, and the status says "Saved". | |
| H21 | Press "Publish". | "Published. Students in this class can see this deck." The label says "Published", the "Publish" button is replaced by "Present", and the line under the buttons says "Students in this class can see this deck. Changes show as you save." Student window: after a reload, "QA slides" is in the Decks list. | |
| H22 | Make the browser window narrower than 900 pixels. | The tools and the slide list are replaced by "Open this deck on a larger screen to edit it." and a picture of the current slide that cannot be changed. Make the window wide again and the editor comes back. | |
| H23 | Press "Present". On the deck page that opens, press "Present" again. Student window: open QA slides and press "Join live". | The deck page shows your slides with the label "SLIDES" and the links "Export PDF" and "Edit slides". The student follows your slide as in C10 to C13. Press "End session" when done. | |
| H24 | Go back to the editor and press "Export PDF". | A page with "Choose Save as PDF in the print window. Each slide is one 16:9 page. In Safari, choose Landscape." and every slide in order. | |
| H25 | Press "Print or save as PDF" and save the file. | The print window of the browser. The saved PDF has one wide page per slide, and nothing is cut off. | |

## I. Teacher, Ops

Teacher window: Maria Santos, on the class page of Database Administration. Student window:
Ana Reyes, then Ben Cruz.

### Building a quiz

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| I1 | Scroll to "Ops". | Four activities: "Roles and privileges check" (Quiz, Published), "Backups check" (Quiz, Draft), "Access review essay" (Upload, Published) and "Backup plan" (Upload, Published). Each quiz has a "Results" link. There is a "Gradebook" link. | |
| I2 | Type `QA quiz` in "Quiz title" and press "New quiz". | The quiz page with the labels "Layer 03 · Ops" and "Quiz", a "Draft" chip, the sections "Settings", "Questions" and "Publish", and "No questions yet. Add the first one." | |
| I3 | Press "Publish quiz". | "Add at least one question before publishing." | |
| I4 | Press "Add question". Leave "Kind" on "Multiple choice". Type a question, set "Points" to 1, fill in "Option 1", "Option 2" and "Option 3", tick "Correct option" on the second row, and press "Save question". | "Question saved". A card "Question 1" with "Multiple choice", your three options, and "Correct" next to the second one. | |
| I5 | Add a second question with "Kind" set to "True or false". Under "Right answer" choose "False". Save it. | "Question saved" and a card "Question 2" with "True or false". | |
| I6 | Add a third question with "Kind" set to "Identification". In "Accepted answers" type two answers on two lines. Save it. | The hint "One per line. Capital letters and extra spaces are ignored." Then "Question saved" and a card "Question 3" that lists both answers under "Accepted answers". | |
| I7 | Press "Move up" on Question 3. | "Moved". The identification question is now Question 2. | |
| I8 | Add a fourth question of any kind, then press "Delete" on it. | "Question deleted" and three questions remain. | |
| I9 | Press "Edit" on Question 1, change the wording and press "Save question". | A form "Edit question 1" filled with the saved question. After saving, the card shows the new wording. | |
| I10 | In "Settings" set "Attempts allowed" to 2 and "Show answers" to "Right after a student submits". Press "Save settings". | "Showing answers right after submitting needs exactly one attempt." Nothing is saved. | |
| I11 | Set "Attempts allowed" to 1, pick a "Due date" next week, leave "Time limit in minutes" empty and press "Save settings". | "Settings saved". After a reload the due date and the other settings are still there. | |
| I12 | Press "Publish quiz". | "Quiz published. Students can take it now." The chip says "Published", and the Questions section says "This quiz is published. Unpublish it to change questions." | |
| I13 | Student window, as Ana Reyes: open the class, click "QA quiz", press "Start quiz", answer one question right and one wrong, and press "Submit quiz". | On the result page each question is marked "Correct" or "Incorrect", and the wrong one shows "Correct answer:" with the right answer. This is different from D8 because this quiz shows answers right after submitting. | |

### An upload activity and grading

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| I14 | Teacher window: on the class page type `QA upload` in "Activity title", set "Points" to 20 and press "New upload activity". | The activity page with the labels "Layer 03 · Ops" and "Upload", a "Draft" chip, the sections "Settings", "Publish" and "Submissions", and each student of the class listed as "Not handed in". | |
| I15 | Pick a "Due date" next week and press "Save settings". Then press "Publish activity". | "Settings saved", then "Activity published. Students can hand in work now." Student window: after a reload "QA upload" is in the Ops list of the class. | |
| I16 | Teacher window: go back to the class and click "Access review essay". | Under "Submissions": a line that counts handed in, graded, late and not handed in, and the warning "Student files are not virus scanned. Open them in the browser or in a protected view, and do not enable editing or content." Ana Reyes is "Graded" with "Graded by Maria Santos" and a time. Ben Cruz is "Submitted" with the file "access-review-ben-cruz.docx". Carla Dizon is "Not handed in". | |
| I17 | Click "Open file" in Ben Cruz's row. | The Word file opens or downloads. | |
| I18 | Type 21 in "Score for Ben Cruz" and press "Save grade". | "Enter a whole number from 0 to 20." No grade is saved. | |
| I19 | Type 18, write a sentence in "Feedback for Ben Cruz" and press "Save grade". | "Grade saved". The row says "Graded" and "Graded by Maria Santos" with the time. | |
| I20 | Change the score to 19 and press "Save grade". | "Grade changed". Under the row, a short history: "First score 18" and "Changed from 18 to 19", each with who and when. | |
| I21 | Student window: sign out and log in as `student2@penta.local`. Open "Access review essay", then "Grades". | "19 of 20" and your feedback sentence on the activity page. The same score on the Grades page. | |
| I22 | Teacher window: go back to the class and click "Backup plan". | Ben Cruz's file "backup-plan-ben-cruz.pdf" has the chip "Late by 1 day". If you did D19 to D22, Ana Reyes has a file with "Late by 2 days". | |

### Gradebook and results

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| I23 | Go back to the class and click "Gradebook". | The heading "Database Administration" with the labels "Gradebook" and "COMP 018", a count of students and activities, and a table "Scores by student and activity" with one row per student, one column per published activity and a "Total" column. | |
| I24 | Read the rows. | Ana Reyes has 17 under Access review essay. Ben Cruz has 19 there. Work that is handed in but has no score says "Not graded". Work that is past due and not handed in says "Missing". Late work has the word "Late". Under the table: "Missing work counts as zero. Work that is handed in but not graded is left out of totals until it is graded." | |
| I25 | Press "Export CSV" and open the file in a spreadsheet. | A file named `COMP-018-grades.csv`. The first column is "Student". Each activity has two columns, one that ends in "(score, out of" and its points, and one that ends in "(status)". The last four columns are "Total earned", "Total possible", "Percent" and "Not graded". The numbers match the table on the page. | |
| I26 | Go back to the class and click "Results" next to "Roles and privileges check". | A table "Best score per student" with the columns Student, Best score, Percent, Attempts and Submitted. Ana Reyes has a score, a percent and a time. A student who has not started shows "Not started". | |
| I27 | Scroll to "Percent correct per question". | "Based on each student's first submitted attempt." Each of the five questions has its kind, its points and a line in the shape "1 of 1 correct, 100%". If only Ana Reyes has taken the quiz, question 2 says "0 of 1 correct, 0%" and the other four say "1 of 1 correct, 100%". | |

## J. Teacher, Threads

Teacher window: Maria Santos. Student window: Ana Reyes.

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| J1 | Open the class Database Administration and scroll to "Questions in this class". | "Why does a role need usage on a schema?" with "1 hidden", "Is the quiz timed?" with a "Locked" chip, and "QA question" from section E. | |
| J2 | Click "Why does a role need usage on a schema?". | All four posts, including the one by Carla Dizon that says "Just give the role superuser and stop asking, it is faster." It is marked "Hidden from students". Under the heading: the button "Lock thread" and the lines "A locked thread stays readable. Nobody can post or edit until you unlock it." and "You can hide any post. Hidden posts are not sent to students." | |
| J3 | Press "History" on Carla Dizon's post. | "Hidden by Maria Santos" with a time. | |
| J4 | Press "Unhide" on that post. Keep the student window open on the same thread. | "Shown to students again". The student window shows the post within a few seconds, without a reload. | |
| J5 | Press "Hide" on Ben Cruz's reply, then "History" on it. | "Hidden from students" on the reply, and "Hidden by Maria Santos" with a time in the history. The reply disappears from the student window within a few seconds. Press "Unhide" to bring it back. | |
| J6 | Type in "Your answer" and press "Post answer". | Your answer is posted with the mark "Teacher". The student window shows it within a few seconds. | |
| J7 | Student window: open "QA question", post a new answer, press "Edit" on it, change the text and press "Save edit". Teacher window: open "QA question". | The post says "edited" and "Edited 1 time". "History" shows "Edited by Ana Reyes" with a time, then "Earlier text:" and the text as it was before the edit. | |
| J8 | Teacher window: press "Lock thread". | "Thread locked. Nobody can post or edit." A "Locked" chip, and the button now says "Unlock thread". Student window, within a few seconds: "This thread is locked." and no answer box, "Reply" or "Edit". | |
| J9 | Press "Unlock thread". | "Thread unlocked." The student's answer box comes back. | |
| J10 | Press "Hide" on the first post, the question itself. | A warning "Hiding the question hides the whole thread from students." with the buttons "Hide the thread" and "Cancel". | |
| J11 | Press "Cancel". Then press "Hide" again and "Hide the thread". | Cancel changes nothing. After "Hide the thread", the student window shows "This question is no longer available." with the link "Back to your classes". The teacher's list on the class page marks it "Question hidden from students". | |
| J12 | Press "Unhide" on the question. | The student can open "QA question" again from the lesson. | |

## K. Access checks

These steps check that people only reach what is theirs. You need addresses copied from the
teacher window. To copy an address, click the address bar and copy all of it.

From the teacher window, as Maria Santos, copy and keep these six addresses:

- the class page of Database Administration,
- the page you get from "Edit" next to the lesson "Point in time recovery",
- the page you get from "Open the lesson as a student sees it" on that same lesson,
- the "Gradebook" page of the class,
- the "Results" page of "Roles and privileges check",
- the deck page of "Backup strategies".

You also have the editor address from H1 and the thread address from E4.

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| K1 | Student window, as Ana Reyes: paste the lesson "Edit" address. | You land on "Your classes", the student page. The editor is not shown. | |
| K2 | Paste the "Gradebook" address. | You land on your own "Grades" page. No other student's score is shown. | |
| K3 | Paste the "Results" address. | You land on "Your classes". | |
| K4 | Paste the editor address from H1. | You land on "Your classes". | |
| K5 | Add `/grades.csv` to the end of the class address and open it. | A bare page that says "Not found". No file is downloaded. | |
| K6 | Open the class page and look for the lesson "Point in time recovery" and the quiz "Backups check". | Neither is listed. | |
| K7 | Paste the student-view address of "Point in time recovery". | The page "Not found" with the link "Back to the hub". | |
| K8 | Teacher window: make a new deck with "New deck" and do **not** publish it. Copy the address, then remove `/edit` from the end. Student window: paste that address. | "Not found". The deck is also missing from the student's Decks list. | |
| K9 | Student window: sign out and log in as `qa.student@penta.local`. This student was removed from the class in F16. Paste the class address. | "Not found" with the link "Back to the hub". | |
| K10 | Paste the "Backup strategies" deck address, then the thread address from E4. | "Not found" both times. | |
| K11 | Sign out and log in as `qa.teacher@penta.local`, the teacher from A14 who does not own this class. Paste the class address, then the "Gradebook" address. | "Not found" both times. | |
| K12 | Sign out. Paste the class address. | The Log in page. The address bar ends in `?next=` followed by the page you asked for. | |
| K13 | Log in as `student1@penta.local`. | You land on the class page you asked for in K12, not on the hub. | |
| K14 | Sign out. In the address bar open `/hub`, then `/classes`, then `/grades`, then the deck address. | The Log in page every time. | |

## L. Resilience

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| L1 | Signed out, in the address bar replace everything after the site address with `/no-such-page`. | A page in the PENTA style with the label "404", the heading "Not found", "This page does not exist, or it is no longer available to you." and the button "Back to PENTA", which opens the landing page. | |
| L2 | Log in as Ana Reyes and open `/classes/no-such-class`. | The same "Not found" page, now under the top bar, with the button "Back to the hub". | |
| L3 | Open the thread "Why does a role need usage on a schema?". Type a sentence in "Your answer" and do **not** post it. Open the hub in a second tab of the same window and press "Sign out" there. Go back to the first tab and press "Post answer". | "Your session ended. Log in again in another tab, then send this again. Your text is still here." The sentence is still in the box. Nothing was posted. | |
| L4 | In the second tab, log in as Ana Reyes again. Go back to the first tab and press "Post answer". | The answer is posted. | |
| L5 | Stay on the thread. Type another sentence in "Your answer". Turn the network off in the browser: press F12, open the "Network" tab and change "No throttling" to "Offline". Press "Post answer". | A page with the label "Error", the heading "That did not work", "PENTA could not finish that. Check your connection, then try again. Anything you typed and did not save may need to be typed again." and the buttons "Try again" and "Back to the hub". The top bar is still there. | |
| L6 | Change "Offline" back to "No throttling" and press "Try again". | The thread comes back. The answer from L5 was not posted. | |
| L7 | Teacher window, as Maria Santos: click "Classes". Fill in the "Create a class" form with the title `Double click` and double-click "Create class" as fast as you can. Then click "Classes". | Exactly one class named "Double click". | |
| L8 | In that class, type a module title and double-click "Add module". Type a quiz title and double-click "New quiz", then go back to the class. | One new module and one new quiz. | |
| L9 | Student window: on a thread, type an answer and double-click "Post answer". | The answer is posted once. | |
| L10 | Teacher window: open "Edit" on any lesson and change the body. Sign out in a second tab, then press "Save" in the first tab. | "Your session ended. Log in again in another tab, then save again. Your text is still here." The text you typed is still in the Body box. | |

## M. Keyboard and screen

Student window: Ana Reyes. Put the mouse aside for M1 to M8.

| # | Do this | You should see | Pass / Fail |
| --- | --- | --- | --- |
| M1 | Open the hub. Click the address bar, then press Tab once. | A link "Skip to the page" appears at the top. It is the first stop on the page. | |
| M2 | Press Enter on it, then press Tab. | Focus jumps past the top bar to the content of the page. | |
| M3 | Reload, then press Tab again and again through the whole hub. | The stops come in reading order: "Skip to the page", the "Penta" tag, "Classes", "Grades", the theme button, "Sign out", then the links and cards of the page. Every stop shows a clear outline, including each class card. Focus never disappears and never lands on something hidden behind a panel. | |
| M4 | Tab to the COMP 018 class card and press Enter. Tab to the lesson "Logical backups with pg_dump" and press Enter. Tab to "Mark as done" and press Enter. | The class page, then the lesson, then "Marked as done." Each was reached with the keyboard only. | |
| M5 | Go back to the class with the keyboard. Tab to the deck "Backup strategies" and press Enter. Tab until the slide area has the outline, then use the arrow keys, Home and End. Tab to "Next slide" and press Enter. | The slides move as in C4 and C5. The arrows, the strip of markers and the download link can all be reached with Tab. | |
| M6 | Open "QA upload" from the class page with the keyboard. Tab to the file box and press Space. | The file window of your computer opens. After you choose a file, "Hand in" can be reached with Tab and pressed with Enter. | |
| M7 | Open a thread with the keyboard, Tab to "Your answer", type, Tab to "Post answer" and press Enter. | The answer is posted. | |
| M8 | Tab to the theme button and press Enter. Tab to "Sign out" and press Enter. | The theme switches. Then the Log in page. Switch the theme back after logging in again. | |
| M9 | Make the browser window about as wide as a phone, close to 390 pixels, or use a real phone. Open the landing page and scroll from top to bottom. | Nothing is cut off at the sides and the page never scrolls sideways. The three panels scroll like a normal page and are not pinned. | |
| M10 | At the same width, log in as Ana Reyes and open the hub, Classes, the class page, a lesson, a deck, a quiz, an upload activity, Grades and a thread. | The page itself never scrolls sideways. All text can be read and every button can be pressed. A wide table may scroll inside its own frame. | |
| M11 | Make the window wide again. Zoom the browser to 200 percent with Ctrl and the plus key (Cmd and plus on a Mac). Open the same pages as in M10. | The text is larger and still readable. Nothing overlaps, nothing is cut off, and every form can still be filled in and sent. Set the zoom back to 100 percent afterwards. | |

## Reporting a failure

Send the owner one message per problem with:

1. The step number, for example `D17`.
2. The theme you were in, light or dark.
3. Your device and browser, for example "Windows laptop, Chrome" or "iPhone, Safari".
4. What you did, word for word if you typed something.
5. What you expected, copied from the "You should see" column.
6. What happened instead, with a screenshot or a screen recording.

Never put a password or the teacher signup code in a group chat. If a step in this checklist is
wrong or unclear, report that too: say which step and what you saw.
