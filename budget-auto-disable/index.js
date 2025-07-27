const express = require("express");
const bodyParser = require("body-parser");
const { CloudBillingClient } = require("@google-cloud/billing");

const app = express();
const billing = new CloudBillingClient();
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "gdelc-queries";
const PROJECT_NAME = `projects/${PROJECT_ID}`;

// Parse JSON body
app.use(bodyParser.json());

app.post("/", async (req, res) => {
  try {
    const message = req.body.message;
    if (!message || !message.data) {
      return res.status(400).send("Missing Pub/Sub message data");
    }

    // Decode base64-encoded string
    const decoded = Buffer.from(message.data, "base64").toString();
    const pubsubData = JSON.parse(decoded);

    if (
      typeof pubsubData.costAmount !== "number" ||
      typeof pubsubData.budgetAmount !== "number"
    ) {
      return res.status(400).send("Invalid billing data format");
    }

    if (pubsubData.costAmount <= pubsubData.budgetAmount) {
      return res
        .status(200)
        .send(`No action necessary. (Current cost: ${pubsubData.costAmount})`);
    }

    if (!PROJECT_ID) {
      return res.status(500).send("No project specified");
    }

    const billingEnabled = await isBillingEnabled(PROJECT_NAME);
    if (billingEnabled) {
      const result = await disableBilling(PROJECT_NAME);
      return res.status(200).send(result);
    } else {
      return res.status(200).send("Billing already disabled");
    }
  } catch (err) {
    console.error("Error handling request:", err);
    return res.status(500).send("Internal error");
  }
});

const isBillingEnabled = async (projectName) => {
  try {
    const [res] = await billing.getProjectBillingInfo({ name: projectName });
    return res.billingEnabled;
  } catch (e) {
    console.log("Error checking billing status, assuming enabled:", e.message);
    return true;
  }
};

const disableBilling = async (projectName) => {
  const [res] = await billing.updateProjectBillingInfo({
    name: projectName,
    resource: { billingAccountName: "" },
  });
  return `Billing disabled: ${JSON.stringify(res)}`;
};

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Cloud Run server listening on port ${PORT}`);
});
