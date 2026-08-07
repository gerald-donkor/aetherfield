# Migration guide

import { Callout } from "fumadocs-ui/components/callout";
import { Tabs, Tab } from "fumadocs-ui/components/tabs";

This migration guide aims to list the breaking changes in Zod 4 in order of highest to lowest impact. To learn more about the performance enhancements and new features of Zod 4, read the [introductory post](/v4).

{/* To give the ecosystem time to migrate, Zod 4 will initially be published alongside Zod v3.25. To use Zod 4, upgrade to `zod@3.25.0` or later: */}

```
npm install zod@^4.0.0
```

{/* Zod 4 is available at the `"/v4"` subpath:

  ```ts
  import * as z from "zod";
  ``` */}

Many of Zod's behaviors and APIs have been made more intuitive and cohesive. The breaking changes described in this document often represent major quality-of-life improvements for Zod users. I strongly recommend reading this guide thoroughly.

<Callout>
  **Note** — Zod 3 exported a number of undocumented quasi-internal utility types and functions that are not considered part of the public API. Changes to those are not documented here.
</Callout>

<Callout>
  **Unofficial codemod** — A community-maintained codemod [`zod-v3-to-v4`](https://github.com/nicoespeon/zod-v3-to-v4) is available.
</Callout>

## Error customization

Zod 4 standardizes the APIs for error customization under a single, unified `error` param. Previously Zod's error customization APIs were fragmented and inconsistent. This is cleaned up in Zod 4.

### deprecates `message` parameter

Replaces `message` param with `error`. The old `message` parameter is still supported but deprecated.

<Tabs groupId="error-message" items={["Zod 4", "Zod 3"]} persist>
  <Tab value="Zod 4">
    ```ts
    z.string().min(5, { error: "Too short." });
    ```
  </Tab>

  <Tab value="Zod 3">
    ```ts
    z.string().min(5, { message: "Too short." });
    ```
  </Tab>
</Tabs>

### drops `invalid_type_error` and `required_error`

The `invalid_type_error` / `required_error` params have been dropped. These were hastily added years ago as a way to customize errors that was less verbose than `errorMap`. They came with all sorts of footguns (they can't be used in conjunction with `errorMap`) and do not align with Zod's actual issue codes (there is no `required` issue code).

These can now be cleanly represented with the new `error` parameter.

<Tabs groupId="error-type" items={["Zod 4", "Zod 3"]} persist>
  <Tab value="Zod 4">
    ```ts
    z.string({ 
      error: (issue) => issue.input === undefined 
        ? "This field is required" 
        : "Not a string" 
    });
    ```
  </Tab>

  <Tab value="Zod 3">
    ```ts
    z.string({ 
      required_error: "This field is required",
      invalid_type_error: "Not a string", 
    });
    ```
  </Tab>
</Tabs>

### drops `errorMap`

This is renamed to `error`.

Error maps can also now return a plain `string` (instead of `{message: string}`). They can also return `undefined`, which tells Zod to yield control to the next error map in the chain.

<Tabs groupId="error-map" items={["Zod 4", "Zod 3"]} persist>
  <Tab value="Zod 4">
    ```ts
    z.string().min(5, {
      error: (issue) => {
        if (issue.code === "too_small") {
          return `Value must be >${issue.minimum}`
        }
      },
    });
    ```
  </Tab>

  <Tab value="Zod 3">
    ```ts
    z.string({
      errorMap: (issue, ctx) => {
        if (issue.code === "too_small") {
          return { message: `Value must be >${issue.minimum}` };
        }
        return { message: ctx.defaultError };
      },
    });
    ```
  </Tab>
</Tabs>

{/* ## `.safeParse()` 

  For performance reasons, the errors returned by `.safeParse()` and `.safeParseAsync()` no longer extend `Error`. 

  ```ts
  const result = z.string().safeParse(12); 
  result.error! instanceof Error; // => false
  ```

  It is very slow to instantiate `Error` instances in JavaScript, as the initialization process snapshots the call stack. In the case of Zod's "safe" parse methods, it's expected that you will handle errors at the point of parsing, so instantiating a true `Error` object adds little value anyway. 

  > Pro tip: prefer `.safeParse()` over `try/catch` in performance-sensitive code.

  By contrast the errors thrown by `.parse()` and `.parseAsync()` still extend `Error`. Aside from the prototype difference, the error classes are identical.

  ```ts
  try {
  z.string().parse(12);
  } catch (err) {
  console.log(err instanceof Error); // => true
  }
  ```
  */}

## `ZodError`

{/* 
  ### changes to `.message` 

  Previously the `.message` property on `ZodError` was a JSON.stringified copy of the `.issues` array. This was redundant, confusing, and a bit of an abuse of the `.message` property. Also due to the [`Error` prototype changes](#safeparse) (and inconsistencies in how Node.js logs `Error` subclasses vs other objects) the logging of a multi-line `.message` property got a lot uglier:

  ```sh
  $ tsx index.ts
  ZodError {
  message: '[\n' +
    '  {\n' +
    '    "expected": "string",\n' +
    '    "code": "invalid_type",\n' +
    '    "path": [],\n' +
    '    "message": "Invalid input: expected string, received number"\n' +
    '  }\n' +
    ']'
  }
  ```


  For these reasons, the `.message` property is left empty and the `.issues` array is marked as enumerable. This keeps error logging consistent and pretty:

  ```sh
  $ tsx index.ts
  z.string().parse(234);

  ZodError {
  issues: [
    {
      expected: 'string',
      code: 'invalid_type',
      path: [],
      message: 'Invalid input: expected string, received number'
    }
  ]
  }
  ```

  Vitest uses special handling for `Error` subclasses that ignores enumerable properties.  */}

### updates issue formats

The issue formats have been dramatically streamlined.

```ts
import * as z from "zod"; // v4

type IssueFormats = 
  | z.core.$ZodIssueInvalidType
  | z.core.$ZodIssueTooBig
  | z.core.$ZodIssueTooSmall
  | z.core.$ZodIssueInvalidStringFormat
  | z.core.$ZodIssueNotMultipleOf
  | z.core.$ZodIssueUnrecognizedKeys
  | z.core.$ZodIssueInvalidValue
  | z.core.$ZodIssueInvalidUnion
  | z.core.$ZodIssueInvalidKey // new: used for z.record/z.map 
  | z.core.$ZodIssueInvalidElement // new: used for z.map/z.set
  | z.core.$ZodIssueCustom;
```

Below is the list of Zod 3 issues types and their Zod 4 equivalent:

```ts
import * as z from "zod"; // v3

export type IssueFormats =
  | z.ZodInvalidTypeIssue // ♻️ renamed to z.core.$ZodIssueInvalidType
  | z.ZodTooBigIssue  // ♻️ renamed to z.core.$ZodIssueTooBig
  | z.ZodTooSmallIssue // ♻️ renamed to z.core.$ZodIssueTooSmall
  | z.ZodInvalidStringIssue // ♻️ z.core.$ZodIssueInvalidStringFormat
  | z.ZodNotMultipleOfIssue // ♻️ renamed to z.core.$ZodIssueNotMultipleOf
  | z.ZodUnrecognizedKeysIssue // ♻️ renamed to z.core.$ZodIssueUnrecognizedKeys
  | z.ZodInvalidUnionIssue // ♻️ renamed to z.core.$ZodIssueInvalidUnion
  | z.ZodCustomIssue // ♻️ renamed to z.core.$ZodIssueCustom
  | z.ZodInvalidEnumValueIssue // ❌ merged in z.core.$ZodIssueInvalidValue
  | z.ZodInvalidLiteralIssue // ❌ merged into z.core.$ZodIssueInvalidValue
  | z.ZodInvalidUnionDiscriminatorIssue // ❌ throws an Error at schema creation time
  | z.ZodInvalidArgumentsIssue // ❌ z.function throws ZodError directly
  | z.ZodInvalidReturnTypeIssue // ❌ z.function throws ZodError directly
  | z.ZodInvalidDateIssue // ❌ merged into invalid_type
  | z.ZodInvalidIntersectionTypesIssue // ❌ removed (throws regular Error)
  | z.ZodNotFiniteIssue // ❌ infinite values no longer accepted (invalid_type)
```

While certain Zod 4 issue types have been merged, dropped, and modified, each issue remains structurally similar to Zod 3 counterpart (identical, in most cases). All issues still conform to the same base interface as Zod 3, so most common error handling logic will work without modification.

```ts
export interface $ZodIssueBase {
  readonly code?: string;
  readonly input?: unknown;
  readonly path: PropertyKey[];
  readonly message: string;
}
```

### changes error map precedence

The error map precedence has been changed to be more consistent. Specifically, an error map passed into `.parse()` *no longer* takes precedence over a schema-level error map.

```ts
const mySchema = z.string({ error: () => "Schema-level error" });

// in Zod 3
mySchema.parse(12, { error: () => "Contextual error" }); // => "Contextual error"

// in Zod 4
mySchema.parse(12, { error: () => "Contextual error" }); // => "Schema-level error"
```

### deprecates `.format()`

The `.format()` method on `ZodError` has been deprecated. Instead use the top-level `z.treeifyError()` function. Read the [Formatting errors docs](/error-formatting) for more information.

### deprecates `.flatten()`

The `.flatten()` method on `ZodError` has also been deprecated. Instead use the top-level `z.treeifyError()` function. Read the [Formatting errors docs](/error-formatting) for more information.

### drops `.formErrors`

This API was identical to `.flatten()`. It exists for historical reasons and isn't documented.

### drops `.errors`

This API was an alias for `.issues` in Zod v3 but has been removed. Use `.issues` instead.

### deprecates `.addIssue()` and `.addIssues()`

Directly push to `err.issues` array instead, if necessary.

```ts
myError.issues.push({ 
  // new issue
});
```

{/* ## `.and()` dropped

  The `.and()` method on `ZodType` has been dropped in favor of `z.intersection(A, B)`. Not only is this method rarely used, there are few good reasons to use intersections at all. The `.and()` API prevented bundlers from treeshaking `ZodIntersection`, a fairly large and complex class. 

  ```ts
  z.object({ a: z.string() }).and(z.object({ b: z.number() })); // ❌

  // use z.intersection
  z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() })); // ✅
  // or .extend() when possible
  z.object({ a: z.string() }).extend(z.object({ b: z.number() })); // ✅
  ``` */}

## `z.number()`

### no infinite values

`POSITIVE_INFINITY` and `NEGATIVE_INFINITY` are no longer considered valid values for `z.number()`.

### `.safe()` no longer accepts floats

In Zod 3, `z.number().safe()` is deprecated. It now behaves identically to `.int()` (see below). Importantly, that means it no longer accepts floats.

### `.int()` accepts safe integers only

The `z.number().int()` API no longer accepts unsafe integers (outside the range of `Number.MIN_SAFE_INTEGER` and `Number.MAX_SAFE_INTEGER`). Using integers out of this range causes spontaneous rounding errors. (Also: You should switch to `z.int()`.)

## `z.string()` updates

### deprecates `.email()` etc

String formats are now represented as *subclasses* of `ZodString`, instead of simple internal refinements. As such, these APIs have been moved to the top-level `z` namespace. Top-level APIs are also less verbose and more tree-shakable.

```ts
z.email();
z.uuid();
z.url();
z.emoji();         // validates a single emoji character
z.base64();
z.base64url();
z.nanoid();
z.cuid();
z.cuid2();
z.ulid();
z.ipv4();
z.ipv6();
z.cidrv4();          // ip range
z.cidrv6();          // ip range
z.iso.date();
z.iso.time();
z.iso.datetime();
z.iso.duration();
```

The method forms (`z.string().email()`) still exist and work as before, but are now deprecated.

```ts
z.string().email(); // ❌ deprecated
z.email(); // ✅ 
```

### stricter `.uuid()`

The `z.uuid()` now validates UUIDs more strictly against the RFC 9562/4122 specification; specifically, the variant bits must be `10` per the spec. For a more permissive "UUID-like" validator, use `z.guid()`.

```ts
z.uuid(); // RFC 9562/4122 compliant UUID
z.guid(); // any 8-4-4-4-12 hex pattern
```

### no padding in `.base64url()`

Padding is no longer allowed in `z.base64url()` (formerly `z.string().base64url()`). Generally it's desirable for base64url strings to be unpadded and URL-safe.

### drops `z.string().ip()`

This has been replaced with separate `.ipv4()` and `.ipv6()` methods. Use `z.union()` to combine them if you need to accept both.

```ts
z.string().ip() // ❌
z.ipv4() // ✅
z.ipv6() // ✅
```

### updates `z.string().ipv6()`

Validation now happens using the `new URL()` constructor, which is far more robust than the old regular expression approach. Some invalid values that passed validation previously may now fail.

### drops `z.string().cidr()`

Similarly, this has been replaced with separate `.cidrv4()` and `.cidrv6()` methods. Use `z.union()` to combine them if you need to accept both.

```ts
z.string().cidr() // ❌
z.cidrv4() // ✅
z.cidrv6() // ✅
```

## `z.coerce` updates

The input type of all `z.coerce` schemas is now `unknown`.

```ts
const schema = z.coerce.string();
type schemaInput = z.input<typeof schema>;

// Zod 3: string;
// Zod 4: unknown;
```

## `.default()` updates

The application of `.default()` has changed in a subtle way. If the input is `undefined`, `ZodDefault` short-circuits the parsing process and returns the default value. The default value must be assignable to the *output type*.

```ts
const schema = z.string()
  .transform(val => val.length)
  .default(0); // should be a number
schema.parse(undefined); // => 0
```

In Zod 3, `.default()` expected a value that matched the *input type*. `ZodDefault` would parse the default value, instead of short-circuiting. As such, the default value must be assignable to the *input type* of the schema.

```ts
// Zod 3
const schema = z.string()
  .transform(val => val.length)
  .default("tuna");
schema.parse(undefined); // => 4
```

To replicate the old behavior, Zod implements a new `.prefault()` API. This is short for "pre-parse default".

```ts
// Zod 3
const schema = z.string()
  .transform(val => val.length)
  .prefault("tuna");
schema.parse(undefined); // => 4
```

## `z.object()`

### defaults applied within optional fields

Defaults inside your properties are applied, even within optional fields. This aligns better with expectations and resolves a long-standing usability issue with Zod 3. This is a subtle change that may cause breakage in code paths that rely on key existence, etc.

```ts
const schema = z.object({
  a: z.string().default("tuna").optional(),
});

schema.parse({});
// Zod 4: { a: "tuna" }
// Zod 3: {}
```

### deprecates `.strict()` and `.passthrough()`

These methods are generally no longer necessary. Instead use the top-level `z.strictObject()` and `z.looseObject()` functions.

```ts
// Zod 3
z.object({ name: z.string() }).strict();
z.object({ name: z.string() }).passthrough();

// Zod 4
z.strictObject({ name: z.string() });
z.looseObject({ name: z.string() });
```

> These methods are still available for backwards compatibility, and they will not be removed. They are considered legacy.

### deprecates `.strip()`

This was never particularly useful, as it was the default behavior of `z.object()`. To convert a strict object to a "regular" one, use `z.object(A.shape)`.

### drops `.nonstrict()`

This long-deprecated alias for `.strip()` has been removed.

### drops `.deepPartial()`

This has been long deprecated in Zod 3 and it now removed in Zod 4. There is no direct alternative to this API. There were lots of footguns in its implementation, and its use is generally an anti-pattern.

### changes `z.unknown()` optionality

The `z.unknown()` and `z.any()` types are no longer marked as "key optional" in the inferred types.

```ts
const mySchema = z.object({
  a: z.any(),
  b: z.unknown()
});
// Zod 3: { a?: any; b?: unknown };
// Zod 4: { a: any; b: unknown };
```

### deprecates `.merge()`

The `.merge()` method on `ZodObject` has been deprecated in favor of `.extend()`. The `.extend()` method provides the same functionality, avoids ambiguity around strictness inheritance, and has better TypeScript performance.

```ts
// .merge (deprecated)
const ExtendedSchema = BaseSchema.merge(AdditionalSchema);

// .extend (recommended)
const ExtendedSchema = BaseSchema.extend(AdditionalSchema.shape);

// or use destructuring (best tsc performance)
const ExtendedSchema = z.object({
  ...BaseSchema.shape,
  ...AdditionalSchema.shape,
});
```

> **Note**: For even better TypeScript performance, consider using object destructuring instead of `.extend()`. See the [API documentation](/api?id=extend) for more details.

## `z.nativeEnum()` deprecated

The `z.nativeEnum()` function is now deprecated in favor of just `z.enum()`. The `z.enum()` API has been overloaded to support an enum-like input.

```ts
enum Color {
  Red = "red",
  Green = "green",
  Blue = "blue",
}

const ColorSchema = z.enum(Color); // ✅
```

As part of this refactor of `ZodEnum`, a number of long-deprecated and redundant features have been removed. These were all identical and only existed for historical reasons.

```ts
ColorSchema.enum.Red; // ✅ => "Red" (canonical API)
ColorSchema.Enum.Red; // ❌ removed
ColorSchema.Values.Red; // ❌ removed
```

## `z.array()`

### changes `.nonempty()` type

This now behaves identically to `z.array().min(1)`. The inferred type does not change.

```ts
const NonEmpty = z.array(z.string()).nonempty();

type NonEmpty = z.infer<typeof NonEmpty>; 
// Zod 3: [string, ...string[]]
// Zod 4: string[]
```

The old behavior is now better represented with `z.tuple()` and a "rest" argument. This aligns more closely to TypeScript's type system.

```ts
z.tuple([z.string()], z.string());
// => [string, ...string[]]
```

## `z.promise()` deprecated

There's rarely a reason to use `z.promise()`. If you have an input that may be a `Promise`, just `await` it before parsing it with Zod.

> If you are using `z.promise` to define an async function with `z.function()`, that's no longer necessary either; see the [`ZodFunction`](#function) section below.

## `z.function()`

The result of `z.function()` is no longer a Zod schema. Instead, it acts as a standalone "function factory" for defining Zod-validated functions. The API has also changed; you define an `input` and `output` schema upfront, instead of using `args()` and `.returns()` methods.

<Tabs groupId="lib" items={["Zod 4", "Zod 3"]} persist>
  <Tab value="Zod 4">
    ```ts
    const myFunction = z.function({
      input: [z.object({
        name: z.string(),
        age: z.number().int(),
      })],
      output: z.string(),
    });

    myFunction.implement((input) => {
      return `Hello ${input.name}, you are ${input.age} years old.`;
    });
    ```
  </Tab>

  <Tab value="Zod 3">
    ```ts
    const myFunction = z.function()
      .args(z.object({
        name: z.string(),
        age: z.number().int(),
      }))
      .returns(z.string());

    myFunction.implement((input) => {
      return `Hello ${input.name}, you are ${input.age} years old.`;
    });
    ```
  </Tab>
</Tabs>

If you have a desperate need for a Zod schema with a function type, consider [this workaround](https://github.com/colinhacks/zod/issues/4143#issuecomment-2845134912).

### adds `.implementAsync()`

To define an async function, use `implementAsync()` instead of `implement()`.

```ts
myFunction.implementAsync(async (input) => {
  return `Hello ${input.name}, you are ${input.age} years old.`;
});
```

## `.refine()`

### ignores type predicates

In Zod 3, passing a [type predicate](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates) as a refinement functions could still narrow the type of a schema. This wasn't documented but was discussed in some issues. This is no longer the case.

```ts
const mySchema = z.unknown().refine((val): val is string => {
  return typeof val === "string"
});

type MySchema = z.infer<typeof mySchema>; 
// Zod 3: `string`
// Zod 4: still `unknown`
```

### drops `ctx.path`

Zod's new parsing architecture does not eagerly evaluate the `path` array. This was a necessary change that unlocks Zod 4's dramatic performance improvements.

```ts
z.string().superRefine((val, ctx) => {
  ctx.path; // ❌ no longer available
});
```

### drops function as second argument

The following horrifying overload has been removed.

```ts
const longString = z.string().refine(
  (val) => val.length > 10,
  (val) => ({ message: `${val} is not more than 10 characters` })
);
```

{/* ## `.superRefine()` deprecated

  The `.superRefine()` method has been deprecated in favor of `.check()`. The `.check()` method provides the same functionality with a cleaner API. The `.check()` method is also available on Zod and Zod Mini schemas.

  ```ts
  const UniqueStringArray = z.array(z.string()).check((ctx) => {
  if (ctx.value.length > 3) {
    ctx.issues.push({
      code: "too_big",
      maximum: 3,
      origin: "array",
      inclusive: true,
      message: "Too many items 😡",
      input: ctx.value
    });
  }

  if (ctx.value.length !== new Set(ctx.value).size) {
    ctx.issues.push({
      code: "custom",
      message: `No duplicates allowed.`,
      input: ctx.value
    });
  }
  });
  ``` */}

## `z.ostring()`, etc dropped

The undocumented convenience methods `z.ostring()`, `z.onumber()`, etc. have been removed. These were shorthand methods for defining optional string schemas.

## `z.literal()`

### drops `symbol` support

Symbols aren't considered literal values, nor can they be simply compared with `===`. This was an oversight in Zod 3.

## static `.create()` factories dropped

Previously all Zod classes defined a static `.create()` method. These are now implemented as standalone factory functions.

```ts
z.ZodString.create(); // ❌ 
```

## `z.record()`

### drops single argument usage

Before, `z.record()` could be used with a single argument. This is no longer supported.

```ts
// Zod 3
z.record(z.string()); // ✅

// Zod 4
z.record(z.string()); // ❌
z.record(z.string(), z.string()); // ✅
```

### improves enum support

Records have gotten a lot smarter. In Zod 3, passing an enum into `z.record()` as a key schema would result in a partial type

```ts
const myRecord = z.record(z.enum(["a", "b", "c"]), z.number()); 
// { a?: number; b?: number; c?: number; }
```

In Zod 4, this is no longer the case. The inferred type is what you'd expect, and Zod ensures exhaustiveness; that is, it makes sure all enum keys exist in the input during parsing.

```ts
const myRecord = z.record(z.enum(["a", "b", "c"]), z.number());
// { a: number; b: number; c: number; }
```

To replicate the old behavior with optional keys, use `z.partialRecord()`:

```ts
const myRecord = z.partialRecord(z.enum(["a", "b", "c"]), z.number());
// { a?: number; b?: number; c?: number; }
```

## `z.intersection()`

### throws `Error` on merge conflict

Zod intersection parses the input against two schemas, then attempts to merge the results. In Zod 3, when the results were unmergable, Zod threw a `ZodError` with a special `"invalid_intersection_types"` issue.

In Zod 4, this will throw a regular `Error` instead. The existence of unmergable results indicates a structural problem with the schema: an intersection of two incompatible types. Thus, a regular error is more appropriate than a validation error.

## Internal changes

> The typical user of Zod can likely ignore everything below this line. These changes do not impact the user-facing `z` APIs.

There are too many internal changes to list here, but some may be relevant to regular users who are (intentionally or not) relying on certain implementation details. These changes will be of particular interest to library authors building tools on top of Zod.

### updates generics

The generic structure of several classes has changed. Perhaps most significant is the change to the `ZodType` base class:

```ts
// Zod 3
class ZodType<Output, Def extends z.ZodTypeDef, Input = Output> {
  // ...
}

// Zod 4
class ZodType<Output = unknown, Input = unknown> {
  // ...
}
```

The second generic `Def` has been entirely removed. Instead the base class now only tracks `Output` and `Input`. While previously the `Input` value defaulted to `Output`, it now defaults to `unknown`. This allows generic functions involving `z.ZodType` to behave more intuitively in many cases.

```ts
function inferSchema<T extends z.ZodType>(schema: T): T {
  return schema;
};

inferSchema(z.string()); // z.ZodString
```

The need for `z.ZodTypeAny` has been eliminated; just use `z.ZodType` instead.

### adds `z.core`

Many utility functions and types have been moved to the new `zod/v4/core` sub-package, to facilitate code sharing between Zod and Zod Mini.

```ts
import * as z from "zod/v4/core";

function handleError(iss: z.$ZodError) {
  // do stuff
}
```

For convenience, the contents of `zod/v4/core` are also re-exported from `zod` and `zod/mini` under the `z.core` namespace.

```ts
import * as z from "zod";

function handleError(iss: z.core.$ZodError) {
  // do stuff
}
```

Refer to the [Zod Core](/packages/core) docs for more information on the contents of the core sub-library.

### moves `._def`

The `._def` property is now moved to `._zod.def`. The structure of all internal defs is subject to change; this is relevant to library authors but won't be comprehensively documented here.

### drops `ZodEffects`

This doesn't affect the user-facing APIs, but it's an internal change worth highlighting. It's part of a larger restructure of how Zod handles *refinements*.

Previously both refinements and transformations lived inside a wrapper class called `ZodEffects`. That means adding either one to a schema would wrap the original schema in a `ZodEffects` instance. In Zod 4, refinements now live inside the schemas themselves. More accurately, each schema contains an array of "checks"; the concept of a "check" is new in Zod 4 and generalizes the concept of a refinement to include potentially side-effectful transforms like `z.toLowerCase()`.

This is particularly apparent in the Zod Mini API, which heavily relies on the `.check()` method to compose various validations together.

```ts
import * as z from "zod/mini";

z.string().check(
  z.minLength(10),
  z.maxLength(100),
  z.toLowerCase(),
  z.trim(),
);
```

### adds `ZodTransform`

Meanwhile, transforms have been moved into a dedicated `ZodTransform` class. This schema class represents an input transform; in fact, you can actually define standalone transformations now:

```ts
import * as z from "zod";

const schema = z.transform(input => String(input));

schema.parse(12); // => "12"
```

This is primarily used in conjunction with `ZodPipe`. The `.transform()` method now returns an instance of `ZodPipe`.

```ts
z.string().transform(val => val); // ZodPipe<ZodString, ZodTransform>
```

### drops `ZodPreprocess`

As with `.transform()`, the `z.preprocess()` function now returns a `ZodPipe` instance instead of a dedicated `ZodPreprocess` instance.

```ts
z.preprocess(val => val, z.string()); // ZodPipe<ZodTransform, ZodString>
```

### drops `ZodBranded`

Branding is now handled with a direct modification to the inferred type, instead of a dedicated `ZodBranded` class. The user-facing APIs remain the same.

{/* - Dropping support for ES5
  - Zod relies on `Set` internally */}

{/* - `z.keyof` now returns `ZodEnum` instead of `ZodLiteral` */}

{/* ## Changed: `.refine()`

  The `.refine()` method used to accept a function as the second argument. 

  ```ts
  // no longer supported
  const longString = z.string().refine(
  (val) => val.length > 10,
  (val) => ({ message: `${val} is not more than 10 characters` })
  );
  ```

  This can be better represented with the new `error` parameter, so this overload has been removed.

  ```ts
  const longString = z.string().refine((val) => val.length > 10, {
  error: (issue) => `${issue.input} is not more than 10 characters`,
  });
  ``
  */}

{/* 
  - No support for `null` or `undefined` in `z.literal`
  - `z.literal(null)`
  - `z.literal(undefined)`
  - this was never documented */}

{/* - Array min/max/length checks now run after parsing. This means they won't run if the parse has already aborted. */}

{/* - Drops single-argument `z.record()` */}

{/* - Smarter `z.record`: no longer Partial by default */}

{/* - Intersection merge errors are now thrown as Error not ZodError
  - These usually do not reflect a parse error but a structural problem with the schema */}

{/* - Consolidates `unknownKeys` and `catchall` in ZodObject */}

{/* - Dropping
  - `ZodBranded`: purely a static-domain annotation
  - `ZodFunction` */}

{/* - The `description` is now stored in `z.defaultRegistry`, not the def
  - No support for `description` in factory params
  - Descriptions do not cascade in `.optional()`, etc */}

{/* - Enums:
  - ZodEnum and ZodNativeEnum are merged
  - `.Values` and `.Enum` are removed. Use `.enum` instead.
  - `.options` is removed */}


# Release notes

import { Callout } from "fumadocs-ui/components/callout";
import { Tabs, Tab } from "fumadocs-ui/components/tabs";
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';

After a year of active development: Zod 4 is now stable! It's faster, slimmer, more `tsc`-efficient, and implements some long-requested features.

<Callout icon="❤️">
  Huge thanks to [Clerk](https://go.clerk.com/zod-clerk), who supported my work on Zod 4 through their extremely generous [OSS Fellowship](https://clerk.com/blog/zod-fellowship). They were an amazing partner throughout the (much longer than anticipated!) development process.
</Callout>

## Versioning

{/* <Callout> 
  **Update** — `zod@4.0.0` has now been published to npm. To upgrad
  </Callout> */}

{/* To simplify the migration process both for users and Zod's ecosystem of associated libraries, Zod 4 will initially published alongside Zod 3 as part of the `zod@3.25` release. Despite the version number, it is considered stable and ready for production use. */}

To upgrade:

```
npm install zod@^4.0.0
```

{/* Down the road, when there's broad support for Zod 4, we'll publish `zod@4.0.0` on npm. At this point, Zod 4 will be exported from the package root (`"zod"`). The `"zod/v4"` subpath will remain available. For a detailed writeup on the reasons for this versioning scheme, refer to [this issue](https://github.com/colinhacks/zod/issues/4371).  */}

For a complete list of breaking changes, refer to the [Migration guide](/v4/changelog). This post focuses on new features & enhancements.

{/* A number of popular ecosystem packages have Zod 4 support ready or nearly ready. Track the following pull requests for updates:
  - [`drizzle-zod#4478`](https://github.com/drizzle-team/drizzle-orm/pull/4478)
  - [`@hono/zod-validator#1173`](https://github.com/honojs/middleware/pull/1173) */}

## Why a new major version?

Zod v3.0 was released in May 2021 (!). Back then Zod had 2700 stars on GitHub and 600k weekly downloads. Today it has 37.8k stars and 31M weekly downloads (up from 23M when the beta came out 6 weeks ago!). After 24 minor versions, the Zod 3 codebase had hit a ceiling; the most commonly requested features and improvements require breaking changes.

Zod 4 fixes a number of long-standing design limitations of Zod 3 in one fell swoop, paving the way for several long-requested features and a huge leap in performance. It closes 9 of Zod's [10 most upvoted open issues](https://github.com/colinhacks/zod/issues?q=is%3Aissue%20state%3Aopen%20sort%3Areactions-%2B1-desc). With luck, it will serve as the new foundation for many more years to come.

For a scannable breakdown of what's new, see the table of contents. Click on any item to jump to that section.

## Benchmarks

You can run these benchmarks yourself in the Zod repo:

```sh
$ git clone git@github.com:colinhacks/zod.git
$ cd zod
$ git switch v4
$ pnpm install
```

Then to run a particular benchmark:

```sh
$ pnpm bench <name>
```

### 14x faster string parsing

```sh
$ pnpm bench string
runtime: node v22.13.0 (arm64-darwin)

benchmark      time (avg)             (min … max)       p75       p99      p999
------------------------------------------------- -----------------------------
• z.string().parse
------------------------------------------------- -----------------------------
zod3          363 µs/iter       (338 µs … 683 µs)    351 µs    467 µs    572 µs
zod4       24'674 ns/iter    (21'083 ns … 235 µs) 24'209 ns 76'125 ns    120 µs

summary for z.string().parse
  zod4
   14.71x faster than zod3
```

### 7x faster array parsing

```sh
$ pnpm bench array
runtime: node v22.13.0 (arm64-darwin)

benchmark      time (avg)             (min … max)       p75       p99      p999
------------------------------------------------- -----------------------------
• z.array() parsing
------------------------------------------------- -----------------------------
zod3          147 µs/iter       (137 µs … 767 µs)    140 µs    246 µs    520 µs
zod4       19'817 ns/iter    (18'125 ns … 436 µs) 19'125 ns 44'500 ns    137 µs

summary for z.array() parsing
  zod4
   7.43x faster than zod3
```

### 6.5x faster object parsing

This runs the [Moltar validation library benchmark](https://moltar.github.io/typescript-runtime-type-benchmarks/).

```sh
$ pnpm bench object-moltar
benchmark      time (avg)             (min … max)       p75       p99      p999
------------------------------------------------- -----------------------------
• z.object() safeParse
------------------------------------------------- -----------------------------
zod3          805 µs/iter     (771 µs … 2'802 µs)    804 µs    928 µs  2'802 µs
zod4          124 µs/iter     (118 µs … 1'236 µs)    119 µs    231 µs    329 µs

summary for z.object() safeParse
  zod4
   6.5x faster than zod3
```

## 100x reduction in `tsc` instantiations

Consider the following simple file:

```ts
import * as z from "zod";

export const A = z.object({
  a: z.string(),
  b: z.string(),
  c: z.string(),
  d: z.string(),
  e: z.string(),
});

export const B = A.extend({
  f: z.string(),
  g: z.string(),
  h: z.string(),
});
```

Compiling this file with `tsc --extendedDiagnostics` using `"zod/v3"` results in >25000 type instantiations. With `"zod/v4"` it only results in \~175.

<Callout>
  The Zod repo contains a `tsc` benchmarking playground. Try this for yourself using the compiler benchmarks in `packages/tsc`. The exact numbers may change as the implementation evolves.

  ```sh
  $ cd packages/tsc
  $ pnpm bench object-with-extend
  ```
</Callout>

More importantly, Zod 4 has redesigned and simplified the generics of `ZodObject` and other schema classes to avoid some pernicious "instantiation explosions". For instance, chaining `.extend()` and `.omit()` repeatedly—something that previously caused compiler issues:

```ts
import * as z from "zod";

export const a = z.object({
  a: z.string(),
  b: z.string(),
  c: z.string(),
});

export const b = a.omit({
  a: true,
  b: true,
  c: true,
});

export const c = b.extend({
  a: z.string(),
  b: z.string(),
  c: z.string(),
});

export const d = c.omit({
  a: true,
  b: true,
  c: true,
});

export const e = d.extend({
  a: z.string(),
  b: z.string(),
  c: z.string(),
});

export const f = e.omit({
  a: true,
  b: true,
  c: true,
});

export const g = f.extend({
  a: z.string(),
  b: z.string(),
  c: z.string(),
});

export const h = g.omit({
  a: true,
  b: true,
  c: true,
});

export const i = h.extend({
  a: z.string(),
  b: z.string(),
  c: z.string(),
});

export const j = i.omit({
  a: true,
  b: true,
  c: true,
});

export const k = j.extend({
  a: z.string(),
  b: z.string(),
  c: z.string(),
});

export const l = k.omit({
  a: true,
  b: true,
  c: true,
});

export const m = l.extend({
  a: z.string(),
  b: z.string(),
  c: z.string(),
});

export const n = m.omit({
  a: true,
  b: true,
  c: true,
});

export const o = n.extend({
  a: z.string(),
  b: z.string(),
  c: z.string(),
});

export const p = o.omit({
  a: true,
  b: true,
  c: true,
});

export const q = p.extend({
  a: z.string(),
  b: z.string(),
  c: z.string(),
});
```

In Zod 3, this took `4000ms` to compile; and adding additional calls to `.extend()` would trigger a "Possibly infinite" error. In Zod 4, this compiles in `400ms`, `10x` faster.

> Coupled with the upcoming [`tsgo`](https://github.com/microsoft/typescript-go) compiler, Zod 4's editor performance will scale to vastly larger schemas and codebases.

## 2x reduction in core bundle size

Consider the following simple script.

```ts
import * as z from "zod";

const schema = z.boolean();

schema.parse(true);
```

It's about as simple as it gets when it comes to validation. That's intentional; it's a good way to measure the *core bundle size*—the code that will end up in the bundle even in simple cases. We'll bundle this with `rollup` using both Zod 3 and Zod 4 and compare the final bundles.

| Package | Bundle (gzip) |
| ------- | ------------- |
| Zod 3   | `12.47kb`     |
| Zod 4   | `5.36kb`      |

The core bundle is \~57% smaller in Zod 4 (2.3x). That's good! But we can do a lot better.

## Introducing Zod Mini

Zod's method-heavy API is fundamentally difficult to tree-shake. Even our simple `z.boolean()` script pulls in the implementations of a bunch of methods we didn't use, like `.optional()`, `.array()`, etc. Writing slimmer implementations can only get you so far. That's where Zod Mini comes in.

```sh
npm install zod@^4.0.0
```

It's a Zod variant with a functional, tree-shakable API that corresponds one-to-one with `zod`. Where Zod uses methods, Zod Mini generally uses wrapper functions:

<Tabs groupId="lib" items={[ "Zod Mini", "Zod"]}>
  <Tab value="Zod Mini">
    ```ts
    import * as z from "zod/mini";

    z.optional(z.string());

    z.union([z.string(), z.number()]);

    z.extend(z.object({ /* ... */ }), { age: z.number() });
    ```
  </Tab>

  <Tab value="Zod">
    ```ts
    import * as z from "zod";

    z.string().optional();

    z.string().or(z.number());

    z.object({ /* ... */ }).extend({ age: z.number() });
    ```
  </Tab>
</Tabs>

Not all methods are gone! The parsing methods are identical in Zod and Zod Mini:

```ts
import * as z from "zod/mini";

z.string().parse("asdf");
z.string().safeParse("asdf");
await z.string().parseAsync("asdf");
await z.string().safeParseAsync("asdf");
```

There's also a general-purpose `.check()` method used to add refinements.

<Tabs groupId="lib" items={[ "Zod Mini", "Zod"]}>
  <Tab value="Zod Mini">
    ```ts
    import * as z from "zod/mini";

    z.array(z.number()).check(
      z.minLength(5), 
      z.maxLength(10),
      z.refine(arr => arr.includes(5))
    );
    ```
  </Tab>

  <Tab value="Zod">
    ```ts
    import * as z from "zod";

    z.array(z.number())
      .min(5)
      .max(10)
      .refine(arr => arr.includes(5));
    ```
  </Tab>
</Tabs>

The following top-level refinements are available in Zod Mini. It should be fairly self-explanatory which Zod methods they correspond to.

```ts
import * as z from "zod/mini";

// custom checks
z.refine();

// first-class checks
z.lt(value);
z.lte(value); // alias: z.maximum()
z.gt(value);
z.gte(value); // alias: z.minimum()
z.positive();
z.negative();
z.nonpositive();
z.nonnegative();
z.multipleOf(value);
z.maxSize(value);
z.minSize(value);
z.size(value);
z.maxLength(value);
z.minLength(value);
z.length(value);
z.regex(regex);
z.lowercase();
z.uppercase();
z.includes(value);
z.startsWith(value);
z.endsWith(value);
z.property(key, schema); // for object schemas; check `input[key]` against `schema`
z.mime(value); // for file schemas (see below)

// overwrites (these *do not* change the inferred type!)
z.overwrite(value => newValue);
z.normalize();
z.trim();
z.toLowerCase();
z.toUpperCase();
```

This more functional API makes it easier for bundlers to tree-shake the APIs you don't use. While regular Zod is still recommended for the majority of use cases, any projects with uncommonly strict bundle size constraints should consider Zod Mini.

### 6.6x reduction in core bundle size

Here's the script from above, updated to use `"zod/mini"` instead of `"zod"`.

```ts
import * as z from "zod/mini";

const schema = z.boolean();
schema.parse(false);
```

When we build this with `rollup`, the gzipped bundle size is `1.88kb`. That's an 85% (6.6x) reduction in core bundle size compared to `zod@3`.

| Package         | Bundle (gzip) |
| --------------- | ------------- |
| Zod 3           | `12.47kb`     |
| Zod 4 (regular) | `5.36kb`      |
| Zod 4 (mini)    | `1.88kb`      |

Learn more on the dedicated [`zod/mini`](/packages/mini) docs page. Complete API details are mixed into existing documentation pages; code blocks contain separate tabs for `"Zod"` and `"Zod Mini"` wherever their APIs diverge.

## Metadata

Zod 4 introduces a new system for adding strongly-typed metadata to your schemas. Metadata isn't stored inside the schema itself; instead it's stored in a "schema registry" that associates a schema with some typed metadata. To create a registry with `z.registry()`:

```ts
import * as z from "zod";

const myRegistry = z.registry<{ title: string; description: string }>();
```

To add schemas to your registry:

```ts
const emailSchema = z.string().email();

myRegistry.add(emailSchema, { title: "Email address", description: "..." });
myRegistry.get(emailSchema);
// => { title: "Email address", ... }
```

Alternatively, you can use the `.register()` method on a schema for convenience:

{/* > Unlike all other Zod methods, `.register()` is *not* immutable, it returns the original schema. */}

```ts
emailSchema.register(myRegistry, { title: "Email address", description: "..." })
// => returns emailSchema
```

### The global registry

Zod also exports a global registry `z.globalRegistry` that accepts some common JSON Schema-compatible metadata:

```ts
z.globalRegistry.add(z.string(), { 
  id: "email_address",
  title: "Email address",
  description: "Provide your email",
  examples: ["naomie@example.com"],
  extraKey: "Additional properties are also allowed"
});
```

### `.meta()`

To conveniently add a schema to `z.globalRegistry`, use the `.meta()` method.

{/* > Unlike `.register()`, `.meta()` *is* immutable; it returns a new instance (a clone of the original schema). */}

```ts
z.string().meta({ 
  id: "email_address",
  title: "Email address",
  description: "Provide your email",
  examples: ["naomie@example.com"],
  // ...
});
```

<Callout>
  For compatibility with Zod 3, `.describe()` is still available, but `.meta()` is preferred.

  ```ts
  z.string().describe("An email address");

  // equivalent to
  z.string().meta({ description: "An email address" });
  ```
</Callout>

## JSON Schema conversion

Zod 4 introduces first-party JSON Schema conversion via `z.toJSONSchema()`.

```ts
import * as z from "zod";

const mySchema = z.object({name: z.string(), points: z.number()});

z.toJSONSchema(mySchema);
// => {
//   type: "object",
//   properties: {
//     name: {type: "string"},
//     points: {type: "number"},
//   },
//   required: ["name", "points"],
// }
```

Any metadata in `z.globalRegistry` is automatically included in the JSON Schema output.

```ts
const mySchema = z.object({
  firstName: z.string().describe("Your first name"),
  lastName: z.string().meta({ title: "last_name" }),
  age: z.number().meta({ examples: [12, 99] }),
});

z.toJSONSchema(mySchema);
// => {
//   type: 'object',
//   properties: {
//     firstName: { type: 'string', description: 'Your first name' },
//     lastName: { type: 'string', title: 'last_name' },
//     age: { type: 'number', examples: [ 12, 99 ] }
//   },
//   required: [ 'firstName', 'lastName', 'age' ]
// }

```

Refer to the [JSON Schema docs](/json-schema) for information on customizing the generated JSON Schema.

## Recursive objects

This was an unexpected one. After years of trying to crack this problem, I finally [found a way](https://x.com/colinhacks/status/1919286275133378670) to properly infer recursive object types in Zod. To define a recursive type:

```ts
const Category = z.object({
  name: z.string(),
  get subcategories(){
    return z.array(Category)
  }
});

type Category = z.infer<typeof Category>;
// { name: string; subcategories: Category[] }
```

You can also represent *mutually recursive types*:

```ts
const User = z.object({
  email: z.email(),
  get posts(){
    return z.array(Post)
  }
});

const Post = z.object({
  title: z.string(),
  get author(){
    return User
  }
});
```

Unlike the Zod 3 pattern for recursive types, there's no type casting required. The resulting schemas are plain `ZodObject` instances and have the full set of methods available.

```ts
Post.pick({ title: true })
Post.partial();
Post.extend({ publishDate: z.date() });
```

## File schemas

To validate `File` instances:

```ts
const fileSchema = z.file();

fileSchema.min(10_000); // minimum .size (bytes)
fileSchema.max(1_000_000); // maximum .size (bytes)
fileSchema.mime(["image/png"]); // MIME type
```

## Internationalization

Zod 4 introduces a new `locales` API for globally translating error messages into different languages.

```ts
import * as z from "zod";

// configure English locale (default)
z.config(z.locales.en());
```

See the full list of supported locales in [Customizing errors](/error-customization#locales); this section is always updated with a list of supported languages as they become available.

## Error pretty-printing

The popularity of the [`zod-validation-error`](https://www.npmjs.com/package/zod-validation-error) package demonstrates that there's significant demand for an official API for pretty-printing errors. If you are using that package currently, by all means continue using it.

Zod now implements a top-level `z.prettifyError` function for converting a `ZodError` to a user-friendly formatted string.

```ts
const myError = new z.ZodError([
  {
    code: 'unrecognized_keys',
    keys: [ 'extraField' ],
    path: [],
    message: 'Unrecognized key: "extraField"'
  },
  {
    expected: 'string',
    code: 'invalid_type',
    path: [ 'username' ],
    message: 'Invalid input: expected string, received number'
  },
  {
    origin: 'number',
    code: 'too_small',
    minimum: 0,
    inclusive: true,
    path: [ 'favoriteNumbers', 1 ],
    message: 'Too small: expected number to be >=0'
  }
]);

z.prettifyError(myError);
```

This returns the following pretty-printable multi-line string:

```ts
✖ Unrecognized key: "extraField"
✖ Invalid input: expected string, received number
  → at username
✖ Invalid input: expected number, received string
  → at favoriteNumbers[1]
```

Currently the formatting isn't configurable; this may change in the future.

## Top-level string formats

All "string formats" (email, etc.) have been promoted to top-level functions on the `z` module. This is both more concise and more tree-shakable. The method equivalents (`z.string().email()`, etc.) are still available but have been deprecated. They'll be removed in the next major version.

```ts
z.email();
z.uuidv4();
z.uuidv7();
z.uuidv8();
z.ipv4();
z.ipv6();
z.cidrv4();
z.cidrv6();
z.url();
z.e164();
z.base64();
z.base64url();
z.jwt();
z.lowercase();
z.iso.date();
z.iso.datetime();
z.iso.duration();
z.iso.time();
```

### Custom email regex

The `z.email()` API now supports a custom regular expression. There is no one canonical email regex; different applications may choose to be more or less strict. For convenience Zod exports some common ones.

```ts
// Zod's default email regex (Gmail rules)
// see colinhacks.com/essays/reasonable-email-regex
z.email(); // z.regexes.email

// the regex used by browsers to validate input[type=email] fields
// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/email
z.email({ pattern: z.regexes.html5Email });

// the classic emailregex.com regex (RFC 5322)
z.email({ pattern: z.regexes.rfc5322Email });

// a loose regex that allows Unicode (good for intl emails)
z.email({ pattern: z.regexes.unicodeEmail });
```

## Template literal types

Zod 4 implements `z.templateLiteral()`. Template literal types are perhaps the biggest feature of TypeScript's type system that wasn't previously representable.

```ts
const hello = z.templateLiteral(["hello, ", z.string()]);
// `hello, ${string}`

const cssUnits = z.enum(["px", "em", "rem", "%"]);
const css = z.templateLiteral([z.number(), cssUnits]);
// `${number}px` | `${number}em` | `${number}rem` | `${number}%`

const email = z.templateLiteral([
  z.string().min(1),
  "@",
  z.string().max(64),
]);
// `${string}@${string}` (the min/max refinements are enforced!)
```

Every Zod schema type that can be stringified stores an internal regex: strings, string formats like `z.email()`, numbers, boolean, bigint, enums, literals, undefined/optional, null/nullable, and other template literals. The `z.templateLiteral` constructor concatenates these into a super-regex, so things like string formats (`z.email()`) are properly enforced (but custom refinements are not!).

Read the [template literal docs](/api#template-literals) for more info.

## Number formats

New numeric "formats" have been added for representing fixed-width integer and float types. These return a `ZodNumber` instance with proper inclusive minimum/maximum constraints already added.

```ts
z.int();      // [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]
z.float32();  // [-3.4028234663852886e38, 3.4028234663852886e38]
z.float64();  // [-1.7976931348623157e308, 1.7976931348623157e308]
z.int32();    // [-2147483648, 2147483647]
z.uint32();   // [0, 4294967295]
```

Similarly the following `bigint` numeric formats have also been added. These integer types exceed what can be safely represented by a `number` in JavaScript, so these return a `ZodBigInt` instance with the proper inclusive minimum/maximum constraints already added.

```ts
z.int64();    // [-9223372036854775808n, 9223372036854775807n]
z.uint64();   // [0n, 18446744073709551615n]
```

## Stringbool

The existing `z.coerce.boolean()` API is very simple: falsy values (`false`, `undefined`, `null`, `0`, `""`, `NaN` etc) become `false`, truthy values become `true`.

This is still a good API, and its behavior aligns with the other `z.coerce` APIs. But some users requested a more sophisticated "env-style" boolean coercion. To support this, Zod 4 introduces `z.stringbool()`:

```ts
const strbool = z.stringbool();

strbool.parse("true")         // => true
strbool.parse("1")            // => true
strbool.parse("yes")          // => true
strbool.parse("on")           // => true
strbool.parse("y")            // => true
strbool.parse("enabled")      // => true

strbool.parse("false");       // => false
strbool.parse("0");           // => false
strbool.parse("no");          // => false
strbool.parse("off");         // => false
strbool.parse("n");           // => false
strbool.parse("disabled");    // => false

strbool.parse(/* anything else */); // ZodError<[{ code: "invalid_value" }]>
```

To customize the truthy and falsy values:

```ts
z.stringbool({
  truthy: ["yes", "true"],
  falsy: ["no", "false"]
})
```

Refer to the [`z.stringbool()` docs](/api#stringbool) for more information.

## Simplified error customization

The majority of breaking changes in Zod 4 involve the *error customization* APIs. They were a bit of a mess in Zod 3; Zod 4 makes things significantly more elegant, to the point where I think it's worth highlighting here.

Long story short, there is now a single, unified `error` parameter for customizing errors, replacing the following APIs:

Replace `message` with `error`. (The `message` parameter is still supported but deprecated.)

```diff
- z.string().min(5, { message: "Too short." });
+ z.string().min(5, { error: "Too short." });
```

Replace `invalid_type_error` and `required_error` with `error` (function syntax):

```diff
// Zod 3
- z.string({ 
-   required_error: "This field is required" 
-   invalid_type_error: "Not a string", 
- });

// Zod 4 
+ z.string({ error: (issue) => issue.input === undefined ? 
+  "This field is required" :
+  "Not a string" 
+ });
```

Replace `errorMap` with `error` (function syntax):

```diff
// Zod 3 
- z.string({
-   errorMap: (issue, ctx) => {
-     if (issue.code === "too_small") {
-       return { message: `Value must be >${issue.minimum}` };
-     }
-     return { message: ctx.defaultError };
-   },
- });

// Zod 4
+ z.string({
+   error: (issue) => {
+     if (issue.code === "too_small") {
+       return `Value must be >${issue.minimum}`
+     }
+   },
+ });
```

## Upgraded `z.discriminatedUnion()`

Discriminated unions now support a number of schema types not previously supported, including unions and pipes:

```ts
const MyResult = z.discriminatedUnion("status", [
  // simple literal
  z.object({ status: z.literal("aaa"), data: z.string() }),
  // union discriminator
  z.object({ status: z.union([z.literal("bbb"), z.literal("ccc")]) }),
  // pipe discriminator
  z.object({ status: z.literal("fail").transform(val => val.toUpperCase()) }),
]);
```

Perhaps most importantly, discriminated unions now *compose*—you can use one discriminated union as a member of another.

```ts
const BaseError = z.object({ status: z.literal("failed"), message: z.string() });

const MyResult = z.discriminatedUnion("status", [
  z.object({ status: z.literal("success"), data: z.string() }),
  z.discriminatedUnion("code", [
    BaseError.extend({ code: z.literal(400) }),
    BaseError.extend({ code: z.literal(401) }),
    BaseError.extend({ code: z.literal(500) })
  ])
]);
```

## Multiple values in `z.literal()`

The `z.literal()` API now optionally supports multiple values.

```ts
const httpCodes = z.literal([ 200, 201, 202, 204, 206, 207, 208, 226 ]);

// previously in Zod 3:
const httpCodes = z.union([
  z.literal(200),
  z.literal(201),
  z.literal(202),
  z.literal(204),
  z.literal(206),
  z.literal(207),
  z.literal(208),
  z.literal(226)
]);
```

## Refinements live inside schemas

In Zod 3, they were stored in a `ZodEffects` class that wrapped the original schema. This was inconvenient, as it meant you couldn't interleave `.refine()` with other schema methods like `.min()`.

```ts
z.string()
  .refine(val => val.includes("@"))
  .min(5);
// ^ ❌ Property 'min' does not exist on type ZodEffects<ZodString, string, string>
```

In Zod 4, refinements are stored inside the schemas themselves, so the code above works as expected.

```ts
z.string()
  .refine(val => val.includes("@"))
  .min(5); // ✅
```

### `.overwrite()`

The `.transform()` method is extremely useful, but it has one major downside: the output type is no longer *introspectable* at runtime. The transform function is a black box that can return anything. This means (among other things) there's no sound way to convert the schema to JSON Schema.

```ts
const Squared = z.number().transform(val => val ** 2);
// => ZodPipe<ZodNumber, ZodTransform>
```

Zod 4 introduces a new `.overwrite()` method for representing transforms that *don't change the inferred type*. Unlike `.transform()`, this method returns an instance of the original class. The overwrite function is stored as a refinement, so it doesn't (and can't) modify the inferred type.

```ts
z.number().overwrite(val => val ** 2).max(100);
// => ZodNumber
```

> The existing `.trim()`, `.toLowerCase()` and `.toUpperCase()` methods have been reimplemented using `.overwrite()`.

## An extensible foundation: `zod/v4/core`

While this will not be relevant to the majority of Zod users, it's worth highlighting. The addition of Zod Mini necessitated the creation of a shared sub-package `zod/v4/core` which contains the core functionality shared between Zod and Zod Mini.

I was resistant to this at first, but now I see it as one of Zod 4's most important features. It lets Zod level up from a simple library to a fast validation "substrate" that can be sprinkled into other libraries.

If you're building a schema library, refer to the implementations of Zod and Zod Mini to see how to build on top of the foundation `zod/v4/core` provides. Don't hesitate to get in touch in GitHub discussions or via [X](https://x.com/colinhacks)/[Bluesky](https://bsky.app/profile/colinhacks.com) for help or feedback.

## Wrapping up

I'm planning to write up a series of additional posts explaining the design process behind some major features like Zod Mini. I'll update this section as those get posted.

For library authors, there is now a dedicated [For library authors](/library-authors) guide that describes the best practices for building on top of Zod. It answers common questions about how to support Zod 3 & Zod 4 (including Mini) simultaneously.

```sh
pnpm upgrade zod@latest
```

Happy parsing!<br />
— Colin McDonnell [@colinhacks](https://x.com/colinhacks)
