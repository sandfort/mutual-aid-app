const slackapi = require("~slack/webApi");
const { findChannelByName, addBotToChannel } = require("~slack/channels");
const { REIMBURSEMENT_CHANNEL } = require("~slack/constants");
const {
  volunteersFields,
  findVolunteerById
} = require("~airtable/tables/volunteers");
const {
  paymentRequestsFields,
  paymentRequestsTable
} = require("~airtable/tables/paymentRequests");
const {
  fields: requestFields,
  findRequestByCode
} = require("~airtable/tables/requests");

module.exports = async function newPaymentRequest(record) {
  const reimbursementChannel = await findChannelByName(REIMBURSEMENT_CHANNEL);
  await addBotToChannel(reimbursementChannel.id);

  const code = record.get(paymentRequestsFields.requestCode).toUpperCase();
  const [request, _rErr] = await findRequestByCode(code);
  // lookup if reimbursement request already exists for that code
  console.debug(
    `New Payment Request: ${record.get(
      paymentRequestsFields.id
    )} | ${code} | ${record.get(paymentRequestsFields.amount)} | ${record.get(
      paymentRequestsFields.created
    )}`
  );

  const messageText = await makeMessageText(record, request, code);
  const deliveryMessage = await slackapi.chat.postMessage({
    channel: reimbursementChannel.id,
    unfurl_media: false,
    text: messageText
  });
  if (!deliveryMessage.ok) {
    console.debug(`Couldn't post payment request: ${code}`);
    return;
  }

  await paymentRequestsTable.update([
    {
      id: record.getId(),
      fields: { [paymentRequestsFields.slackThreadId]: deliveryMessage.ts }
    }
  ]);
};

async function makeMessageText(reimbursement, request, reimbursementCode) {
  let intro = "Another delivery has been completed and could use reimbursement";
  const firstName = reimbursement.get(paymentRequestsFields.firstName);
  if (firstName) {
    intro = `${firstName} completed a delivery and could use reimbursement`;
  }

  const paymentMethods = [];
  const venmoId = reimbursement.get(paymentRequestsFields.venmoId);
  if (venmoId) {
    paymentMethods.push(["Venmo", venmoId]);
  }
  const paypalId = reimbursement.get(paymentRequestsFields.paypalId);
  if (paypalId) {
    paymentMethods.push(["Paypal", paypalId]);
  }
  const cashAppId = reimbursement.get(paymentRequestsFields.cashAppId);
  if (cashAppId) {
    paymentMethods.push(["Cash App", cashAppId]);
  }
  if (paymentMethods.length === 0) {
    paymentMethods.push(["Payment Methods", cashAppId]);
  }

  const donation = reimbursement.get(paymentRequestsFields.donation);
  const donationField = [];
  if (donation) {
    donationField.push([
      "Deliverer Donation",
      `$${reimbursement.get(paymentRequestsFields.donation)}`
    ]);
  }

  let intakeVol = null;
  if (request) {
    [intakeVol] = await findVolunteerById(
      request.get(requestFields.intakeVolunteer)
    );
  }
  const intakeVolField = [];
  if (intakeVol && intakeVol.get(volunteersFields.slackId)) {
    intakeVolField.push([
      "Intake Volunteer",
      `<@${intakeVol.get(volunteersFields.slackId)}>`
    ]);
  }

  const receipts = reimbursement.get(paymentRequestsFields.receipts) || [];
  const receiptFields = [];
  receipts.forEach((receipt, i) => {
    receiptFields.push([
      i ? `Receipt ${i + 1}` : "Receipt",
      `<${receipt.url}|link>`
    ]);
  });

  const slackMessage = reimbursement.get(paymentRequestsFields.slackMessage);
  const extraFields = [
    [
      "Code",
      reimbursementCode || "@chma-admins this request is missing a code!"
    ],
    ["Message", slackMessage ? `-\n${slackMessage}` : "None provided"],
    ...donationField,
    [
      "Amount Needed",
      `$${reimbursement.get(paymentRequestsFields.reimbursementAmount)}`
    ],
    ...paymentMethods,
    ...intakeVolField,
    ...receiptFields
  ];
  const status = ":red_circle:";
  const fieldRepresentation = extraFields
    .filter(kv => kv[1])
    .map(kv => `*${kv[0]}*: ${kv[1].trim()}`)
    .join("\n");
  // HACK: use non-breaking space as a delimiter between the status and the rest of the message: \u00A0
  return `${status}\u00A0Hey neighbors! ${intro}:\n${fieldRepresentation}
  
*Want to send money?* Please send any amount to a payment method above and then reply to this post with the amount sent.
The bot isn't smart and will register the first number it finds, so please try and only include one dollar amount!
This example works fine:\n> Sent 20!`;
}
