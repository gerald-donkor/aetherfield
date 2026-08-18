"use server";

import { revalidatePath } from "next/cache";

import {
  resolveTenant as resolveTenantFor,
  type TenantWriteMessages,
} from "../../../lib/auth/tenant";
import { recalculateOrganization } from "../../../lib/db/emission-queries";
import { setFactorMapping as setFactorMappingRow } from "../../../lib/db/factor-mapping-queries";
import { getVisibleFactor } from "../../../lib/db/factor-search-queries";
import { factorEligibility } from "../../../lib/domain/emissions";
import { checkFactorMappingLimit } from "../../../lib/rate-limit";
import {
  FACTOR_MAPPING_ERRORS,
  FACTOR_MAPPING_FIELDS,
  type FactorMappingResult,
  factorMappingSchema,
} from "../../../lib/validation/activity";
import { fieldErrorsFrom } from "../../../lib/validation/result";

/**
 * `/activity/mappings`'s one mutation — choosing the emission factor for one
 * `(category, unit)` pair, prompt 65 — split out from `app/activity/actions.ts`
 * at prompt 125, per `docs/architecture.md` candidate 4.
 *
 * **The same shape as its neighbours in `app/activity/actions.ts`**, in
 * AGENTS.md 10's own letters: no BotID (this is an authenticated path, for the
 * reason `stageImport` there records at length), session and tenant, then the
 * rate limit keyed by user id and failing closed, then `safeParse`, then a
 * tenant-predicated write, then `revalidatePath`, then a typed result. **No
 * redirect on success** (AGENTS.md 10 rule 5).
 *
 * ---
 *
 * **The organisation id never crosses the trust boundary.** It is resolved
 * server-side from the session's membership row, and there is no form field
 * carrying one anywhere in this action. Aetherfield's own `staff` and `admin`
 * roles grant nothing here (AGENTS.md 11.1) — nothing in this file reads
 * `account.role`.
 *
 * **Nothing is ever logged** — not a filename, not a factor id, not an
 * organisation name, and not on a catch. There is no `console` call in this
 * file (AGENTS.md 8.3 rule 2, extended to a customer's commercial data by 5.3).
 */

const FACTOR_MAPPING_FAILURE =
  "We couldn't change that factor just now. Please try again in a moment.";

const FACTOR_MAPPING_SIGNED_OUT =
  "Your session has expired. Sign in again to change emission factors.";

const FACTOR_MAPPING_NO_ORGANIZATION =
  "This account belongs to no organisation. Create one before changing emission factors.";

/* Prompt 73's fourth tenant state. Not a `NO_ORGANIZATION`: this account has
   an organisation and it is scheduled for deletion, so the honest sentence
   names the lock and the way out of it rather than telling somebody to create
   what they already have. Since prompt 122 this goes through the one gate,
   which enforces the marker. */
const FACTOR_MAPPING_ORGANIZATION_LOCKED =
  "This organisation is scheduled for deletion, so its emission factors are locked. Restore it from your account page to make changes.";

/** The three already-staged-import actions' noun in `app/activity/actions.ts`
    is `tooManyRequests`; this flow's own noun is "changes", kept verbatim from
    the file this was split out of. Not shared as a helper — `app/activity/
    factors/actions.ts` restates the identical function for the identical
    reason: three files this small don't earn a shared module. */
const tooManyChanges = (retry: string) =>
  `That's a few too many changes. Try again in ${retry}.`;

const FACTOR_MAPPING_MESSAGES: TenantWriteMessages = {
  signedOut: FACTOR_MAPPING_SIGNED_OUT,
  noOrganization: FACTOR_MAPPING_NO_ORGANIZATION,
  organizationLocked: FACTOR_MAPPING_ORGANIZATION_LOCKED,
  failure: FACTOR_MAPPING_FAILURE,
  throttled: tooManyChanges,
};

/* -------------------------------------------------------------------------- */
/*  setFactorMapping                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Choose the emission factor for one `(category, unit)` pair — prompt 65, and
 * the action that closes the loop `EmissionsSummary`'s coverage line opens.
 *
 * **The same stage order as every action in the import flow**, in AGENTS.md
 * 10's letters, with two differences from its neighbours and both are named
 * where they happen: stage **d** refuses a non-owner, and stage **f**
 * recalculates.
 *
 * **Owner-only, and this is where it is enforced.** Hiding the picker from a
 * member is presentation and never enforcement (AGENTS.md 6.2, 11.2 rule 2). The
 * choice is owner-only because a factor moves every figure in a disclosure,
 * which puts it with `inviteMember` rather than with importing data —
 * `app/account/actions.ts` performs the identical check at the identical stage.
 * Aetherfield's own `staff` and `admin` grant nothing here (AGENTS.md 11.1).
 *
 * **A factor id from the browser is a claim, not a capability.** Stage e
 * re-resolves it under the tenant's own visibility and re-asks the engine's
 * eligibility rule; one belonging to another tenant's private set answers
 * exactly as one that does not exist. No existence oracle.
 *
 * **It recalculates inline rather than leaving a "your figures are stale"
 * notice.** The alternative leaves an already-calculated record showing a figure
 * derived from a factor that is no longer mapped, with nothing on screen saying
 * so — and a stale disclosure figure that looks current is the failure this
 * whole area is shaped against. The cost is a slower action on a large tenant;
 * it is bounded by `checkFactorMappingLimit` and by the platform's function
 * timeout. `recalculateOrganization` is called rather than restated: it is **the
 * one definition of what a recalculation is**, shared with `app/activity/
 * actions.ts`'s own `recalculate`.
 */
export async function setFactorMapping(
  input: unknown,
): Promise<FactorMappingResult> {
  // -- a. BotID: absent on an authenticated path. See `app/activity/
  //      actions.ts`'s `stageImport`. -------------------------------------

  // -- b. Session, tenant and role, then the rate limit --------------------
  /* The same gate the import paths use, with this flow's own messages and
     limiter: stage d below needs the role, and the role is re-read from
     Postgres on every call rather than trusted from the session payload
     (AGENTS.md 11.2 rule 5). No argument is taken from the request, so no
     organisation id can be supplied. The deletion lock and the fail-closed
     limiter are the gate's, unchanged. */
  const resolved = await resolveTenantFor({
    messages: FACTOR_MAPPING_MESSAGES,
    limiter: checkFactorMappingLimit,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { membership } = resolved;

  const userId = membership.account.user.id;
  const organizationId = membership.organization.id;

  // -- c. Parse, with the same schema the leaf ran -------------------------
  const parsed = factorMappingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: FACTOR_MAPPING_ERRORS.invalid,
      fieldErrors: fieldErrorsFrom(parsed.error, FACTOR_MAPPING_FIELDS),
    };
  }
  const {
    category,
    unit,
    factorId,
    scope2Method: lane,
    scope2MarketBasis: basis,
  } = parsed.data;

  // -- d. Authorise --------------------------------------------------------
  if (membership.role !== "owner") {
    return { ok: false, error: FACTOR_MAPPING_ERRORS.notOwner };
  }

  // -- e. Re-resolve the factor, re-check the engine's rule, then write ----
  try {
    const factor = await getVisibleFactor(organizationId, factorId);
    if (!factor) {
      return {
        ok: false,
        error: FACTOR_MAPPING_ERRORS.invalid,
        fieldErrors: { factorId: FACTOR_MAPPING_ERRORS.notFound },
      };
    }

    /* The picker only offers eligible rows, and this asks again anyway: the
       list the browser rendered is a claim about what was offered, not a check.
       The refusal is the engine's own sentence, so a person is told the same
       thing here that the coverage surface would have told them later. */
    const eligibility = factorEligibility(factor, unit);
    if (!eligibility.ok) {
      return {
        ok: false,
        error: FACTOR_MAPPING_ERRORS.invalid,
        fieldErrors: { factorId: eligibility.reason },
      };
    }

    /* **The lane, the basis and the factor's own method have to agree** —
       prompt 85, widened by prompt 86 into a three-case matrix. This is the
       check that decides whether a grid average may reach a market-based
       disclosure figure, and the answer is now "only on the basis the reporter
       chose, and labelled as that basis":

       | lane    | basis                  | the factor must be              |
       | ------- | ---------------------- | -------------------------------- |
       | default | absent (schema)        | *not* a market-based row        |
       | market  | contractual_instrument | a scope 2 `market_based` row    |
       | market  | grid_average           | a scope 2 row that is *not*     |

       The default row is prompt 85's, unchanged, and its reason is unchanged:
       `totalsOf` partitions market-based figures out of `scope2` and `total`,
       so a market-based row on that lane would make the pair's contribution
       vanish from the location-based reading.

       The third row is the substitution prompt 85 refused. It is the Scope 2
       Guidance's rung 5 — "Other grid-average emission factors (subnational or
       national) — see location-based data", Table 6.3, "Market-based scope 2
       data hierarchy examples", quoted in `docs/backend.md` — and the Guidance
       permits it where "no other market-based method data are available". What
       this product refuses is making that assertion *for* the reporter; the
       basis is what records that they made it.

       The picker's list is narrowed the same way, and that narrowing is a
       courtesy: this is the check. */
    const factorIsMarketBased =
      factor.scope === "scope_2" && factor.scope2Method === "market_based";
    const factorIsGridAverage =
      factor.scope === "scope_2" && factor.scope2Method !== "market_based";

    if (lane !== "market_based") {
      if (factorIsMarketBased) {
        return {
          ok: false,
          error: FACTOR_MAPPING_ERRORS.invalid,
          fieldErrors: {
            factorId: FACTOR_MAPPING_ERRORS.marketBasedOnDefaultLane,
          },
        };
      }
    } else if (basis === "grid_average") {
      if (!factorIsGridAverage) {
        return {
          ok: false,
          error: FACTOR_MAPPING_ERRORS.invalid,
          fieldErrors: { factorId: FACTOR_MAPPING_ERRORS.notGridAverage },
        };
      }
    } else if (!factorIsMarketBased) {
      return {
        ok: false,
        error: FACTOR_MAPPING_ERRORS.invalid,
        fieldErrors: { factorId: FACTOR_MAPPING_ERRORS.notMarketBased },
      };
    }

    await setFactorMappingRow({
      organizationId,
      category,
      unit,
      factorId: factor.id,
      lane,
      marketBasis: basis,
      userId,
    });
  } catch {
    return { ok: false, error: FACTOR_MAPPING_FAILURE };
  }

  // -- f. No email. Recalculate, so no stale figure survives the change. ---
  try {
    await recalculateOrganization(organizationId, null);
  } catch {
    /* **The mapping is already written and stays written.** A failed
       recalculation is the same shape as AGENTS.md 10 rule 4's failed email:
       the durable write succeeded, and reporting the whole thing as a failure
       would invite a retry of a change that already landed. The figures are
       stale until the next run, and the sentence below says so rather than
       claiming a clean success. Nothing is logged (8.3 rule 2). */
    revalidatePath("/activity");
    revalidatePath("/activity/mappings");
    return {
      ok: false,
      error:
        "The factor was saved, but the figures could not be recalculated just now. Run a recalculation from the activity page.",
    };
  }

  revalidatePath("/activity");
  revalidatePath("/activity/mappings");
  return { ok: true };
}
