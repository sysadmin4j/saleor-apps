import { NextWebhookApiHandler, SaleorAsyncWebhook } from "@saleor/app-sdk/handlers/next";
import { gql } from "urql";
import { saleorApp } from "../../../saleor-app";
import {
  InvoiceSentWebhookPayloadFragment,
  OrderDetailsFragmentDoc,
} from "../../../../generated/graphql";
import { withOtel } from "@saleor/apps-otel";
import { createLogger } from "../../../logger";
import { SendEventMessagesUseCaseFactory } from "../../../modules/event-handlers/use-case/send-event-messages.use-case.factory";
import { SendEventMessagesUseCase } from "../../../modules/event-handlers/use-case/send-event-messages.use-case";
import { captureException } from "@sentry/nextjs";
import { wrapWithLoggerContext } from "@saleor/apps-logger/node";
import { loggerContext } from "../../../logger-context";
import { ObservabilityAttributes } from "@saleor/apps-otel/src/lib/observability-attributes";

const InvoiceSentWebhookPayload = gql`
  ${OrderDetailsFragmentDoc}
  fragment InvoiceSentWebhookPayload on InvoiceSent {
    invoice {
      id
      metadata {
        key
        value
      }
      privateMetadata {
        key
        value
      }
      message
      externalUrl
      url
      order {
        id
      }
    }
    order {
      ...OrderDetails
    }
  }
`;

const InvoiceSentGraphqlSubscription = gql`
  ${InvoiceSentWebhookPayload}
  subscription InvoiceSent {
    event {
      ...InvoiceSentWebhookPayload
    }
  }
`;

export const invoiceSentWebhook = new SaleorAsyncWebhook<InvoiceSentWebhookPayloadFragment>({
  name: "Invoice sent in Saleor",
  webhookPath: "api/webhooks/invoice-sent",
  asyncEvent: "INVOICE_SENT",
  apl: saleorApp.apl,
  query: InvoiceSentGraphqlSubscription,
});

const logger = createLogger(invoiceSentWebhook.name);

const useCaseFactory = new SendEventMessagesUseCaseFactory();

const handler: NextWebhookApiHandler<InvoiceSentWebhookPayloadFragment> = async (
  req,
  res,
  context,
) => {
  logger.info("Webhook received");

  const { payload, authData } = context;
  const { order } = payload;

  if (!order) {
    logger.error("No order data payload");

    return res.status(200).end();
  }

  const recipientEmail = order.userEmail || order.user?.email;

  if (!recipientEmail?.length) {
    logger.error(`The order had no email recipient set. Aborting.`, { orderNumber: order.number });

    return res
      .status(200)
      .json({ error: "Email recipient has not been specified in the event payload." });
  }

  const channel = order.channel.slug;

  loggerContext.set(ObservabilityAttributes.CHANNEL_SLUG, channel);

  const useCase = useCaseFactory.createFromAuthData(authData);

  return useCase
    .sendEventMessages({
      channelSlug: channel,
      event: "INVOICE_SENT",
      payload: { order: payload.order },
      recipientEmail,
    })
    .then((result) =>
      result.match(
        (r) => {
          logger.info("Successfully sent email(s)");

          return res.status(200).json({ message: "The event has been handled" });
        },
        (err) => {
          const errorInstance = err[0];

          if (errorInstance instanceof SendEventMessagesUseCase.ServerError) {
            logger.error("Failed to send email(s) [server error]", { error: err });

            return res.status(500).json({ message: "Failed to send email" });
          } else if (errorInstance instanceof SendEventMessagesUseCase.ClientError) {
            logger.info("Failed to send email(s) [client error]", { error: err });

            return res.status(400).json({ message: "Failed to send email" });
          } else if (errorInstance instanceof SendEventMessagesUseCase.NoOpError) {
            logger.info("Sending emails aborted [no op]", { error: err });

            return res.status(200).json({ message: "The event has been handled [no op]" });
          }

          logger.error("Failed to send email(s) [unhandled error]", { error: err });
          captureException(new Error("Unhandled useCase error", { cause: err }));

          return res.status(500).json({ message: "Failed to send email [unhandled]" });
        },
      ),
    );
};

export default wrapWithLoggerContext(
  withOtel(invoiceSentWebhook.createHandler(handler), "api/webhooks/invoice-sent"),
  loggerContext,
);

export const config = {
  api: {
    bodyParser: false,
  },
};
