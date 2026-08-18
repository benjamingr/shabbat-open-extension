/**
 * Google Apps Script — emails the full text of each form response.
 *
 * Google's built-in "Get email notifications for new responses" only says that a response
 * arrived; you still have to open the form to read it. This sends the answers themselves,
 * so a report or an appeal can be triaged straight from the inbox.
 *
 * Install (per form — once for the report form, once for the appeal form):
 *   1. Open the form in edit mode → ⋮ → Apps Script
 *   2. Replace the contents of Code.gs with this file, and set NOTIFY_TO below
 *   3. Save, then run `installTrigger` once and accept the permission prompt
 *   4. Submit a test response and confirm the mail arrives
 *
 * The trigger runs as the account that installed it, so install it from the project's
 * alias account. Consumer Gmail allows 100 script-sent emails per day, far above any
 * realistic report volume.
 */

/** Where notifications go. Use the project's alias address. */
const NOTIFY_TO = 'REPLACE_WITH_ALIAS_EMAIL'

/** Subject prefix, so the two forms stay filterable in the inbox. */
const SUBJECT_PREFIX = '[shabbat-open]'

function onFormSubmit(e) {
  const form = FormApp.getActiveForm()
  const answers = e.response.getItemResponses().map(function (item) {
    return item.getItem().getTitle() + ':\n' + item.getResponse()
  })

  // getTimestamp() rather than a fresh Date: the submission time is what matters, and a
  // queued trigger can fire noticeably later.
  const submittedAt = Utilities.formatDate(
    e.response.getTimestamp(),
    'Asia/Jerusalem',
    'yyyy-MM-dd HH:mm',
  )

  const body = [
    answers.join('\n\n') || '(empty response)',
    '',
    '—',
    'Submitted: ' + submittedAt,
    'Responses: ' + form.getEditUrl(),
  ].join('\n')

  MailApp.sendEmail({
    to: NOTIFY_TO,
    subject: SUBJECT_PREFIX + ' ' + form.getTitle(),
    body: body,
  })
}

/** Run once, by hand, to attach the trigger above to this form. */
function installTrigger() {
  const form = FormApp.getActiveForm()

  // Installing twice would send duplicate mail for every response.
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'onFormSubmit') ScriptApp.deleteTrigger(trigger)
  })

  ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create()
  Logger.log('Trigger installed for: ' + form.getTitle())
}
