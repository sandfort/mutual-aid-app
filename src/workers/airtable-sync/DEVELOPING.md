### Running
You can run the worker locally pretty easily:

`npm run local:airtable-sync`

Another thing that can be useful is directly running the handler that gets called when a record is set to "Delivery Needed".
This will resend the notification for the Request with Record ID 1

`node ./src/workers/airtable-sync/actions/updateMessageContent.js 1`

### Getting started
To understand how to use ChangeDetector and schedule tasks, start in ./worker.js.
