# PROD-20 Machine Commerce

Status: **PROVISIONAL CODE-COMPLETE**. This is not payment processing or release authority.

The canonical `machine-commerce` owner binds a previously authenticated `agent | service` principal to exact Network Trust Evidence, Commercial Offer, Delegated Commercial Mandate, Acquisition Intent, Action Boundary evidence, and external payment authorization evidence. Its deterministic terminal surface is `selected | declined | challenge-required`.

Selection only makes entitlement provisioning eligible through an explicit downstream control-plane boundary. It never creates entitlement itself, executes a protected action, captures funds, maintains a wallet, or owns tax/FX/accounting truth.

Live issuer/key revocation, external payment adapter, entitlement provisioning, and independent external-host acquisition evidence remain release blockers.
