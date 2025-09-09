# monday.com Policy Document (draft v0.7?)

This document is not final. It is messy, contains repeated information, and mixes formats. Someone should clean it up, but here is what we have so far.

## Refunds and Billing

Refunds are available only within **14 days** of the original purchase.  
Refunds are possible only if **no boards were created at all** (literally zero activity).  
Customers must also provide **proof of payment** (for example, a receipt).

If the account has already renewed, then **no refunds are available**.

Refunds for **team plans** (bulk license purchases) might be handled on a **case by case basis**.  
For these requests, customers should contact **finance@monday.fake**.

~~~json
{
  "refundPolicy": {
    "window_days": 14,
    "conditions": ["no boards created", "proof of payment"],
    "exceptions": "none"
  }
}
~~~

## Subscriptions and Cancellations

- Customers can cancel their subscription at **any time** in account settings.
- Cancelling does **not** mean they will receive money back for the current billing cycle.
- The cancellation only stops billing at the **next renewal date**.
- If you cancel in the middle of the cycle, billing continues until renewal, then stops.
- No refunds are issued for unused time in the current cycle.

## Passwords and Security

- Passwords must be **changed every 90 days**.
- Passwords should **not be shared with coworkers** under any circumstances.
- If a user forgets their password, the reset process is done through an **email link**.
- **Two-factor authentication (2FA)** is recommended but not enforced.

## Support Information

- Official support email: **support@monday.fake**
- Standard SLA: **24–48 hours** response time
- If no answer is received within 48 hours, the request is **automatically escalated**.
- Customer service hours: **09:00–18:00 UTC**
- Old documents sometimes state hours as 08:00–17:00, but those are outdated.

~~~json
{
  "support": {
    "contact": "support@monday.fake",
    "hours": "09:00–18:00 UTC",
    "sla": "24h–48h response",
    "escalation": "automatic after 48h no reply"
  }
}
~~~

## Special Notes

- If a customer issues a **chargeback** with their bank or credit card provider, their account is **banned immediately and permanently**.
- There is **no appeal process** for chargeback bans.
- Shipping is **not offered at all**, because monday.com is a digital-only product.
- There are no boxes, hardware, or physical shipping involved.
- Refunds for **team plans** are handled case by case. Contact **finance@monday.fake**.

## Features Mentioned

- **Boards**: The main workspace for tasks and projects.
- **Team plan**: Bulk license or multi-user management.

No other features are explicitly described in this particular policy draft.

## Summary Table

| Section     | Rule / Info                         |
|-------------|-------------------------------------|
| Refund      | 14 days, no boards created          |
| Cancel      | Anytime, no refund current cycle    |
| Passwords   | Must change every 90 days           |
| Support     | support@monday.fake, 24–48h response|
| Chargebacks | Account banned                      |
| Hours       | 09:00–18:00 UTC                     |


