const slackapi = require("~slack/webApi");
const { findChannelByName } = require("~slack/channels");
const { REIMBURSEMENT_CHANNEL } = require("~constants");
const {
  findPaymentRequestBySlackThreadId,
  fields: paymentRequestFields
} = require("~airtable/tables/paymentRequests");
const {
  createDonorPayment,
  fields: donorFields
} = require("~airtable/tables/donorPayments");

module.exports.register = function register(slackEvents) {
  slackEvents.on("message", filterAndReply);
};

const filterAndReply = async event => {
  if (event.bot_id) {
    return;
  }
  const reimbursementChannel = await findChannelByName(REIMBURSEMENT_CHANNEL);
  if (!isReimbursementReply(event, reimbursementChannel.id)) {
    return;
  }
  const [paymentRequest] = await findPaymentRequestBySlackThreadId(
    event.thread_ts
  );
  if (!paymentRequest) {
    console.log("paymentRequest not posted by bot.");
    return;
  }
  const amountMatches = findAmountsInString(event.text);
  if (!amountMatches || amountMatches.length === 0) {
    console.log(`No money matches found in: ${event.text}`);
    return;
  }

  const newDonationAmount = Number(amountMatches[0]);
  const oldBalance = paymentRequest.get(paymentRequestFields.balance);
  const newBalance = oldBalance - newDonationAmount;

  const [record] = await createDonorPayment({
    [donorFields.amount]: newDonationAmount,
    [donorFields.paymentRequest]: [paymentRequest.getId()],
    [donorFields.status]: donorFields.status_options.pending,
    [donorFields.donorSlackId]: event.user,
    [donorFields.recipientConfirmation]:
      donorFields.recipientConfirmation_options.pending,
    [donorFields.donorConfirmation]:
      donorFields.donorConfirmation_options.confirmed
  });
  if (!record) {
    console.log("Couldn't add donor's payment");
    return;
  }

  const message =
    newBalance <= 0
      ? "reimbursement is complete!!"
      : `just ${newBalance} to go!`;
  await slackapi.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel: reimbursementChannel.id,
    thread_ts: event.thread_ts,
    text: `Thanks <@${event.user}>! They sent ${newDonationAmount}, ${message}`
  });
};

const findAmountsInString = text => {
  return text.replace(/<.{0,15}>/g, "").match(/\d+\.?\d*/g);
};

const isReimbursementReply = (event, reimbursementChannelId) => {
  return event.channel === reimbursementChannelId && event.parent_user_id;
};
