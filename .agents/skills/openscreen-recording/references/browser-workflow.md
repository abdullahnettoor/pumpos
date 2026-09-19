# Browser workflow

## Division of work

Use the browser protocol to inspect and assert. Use macOS events to perform visible pointer actions.

```text
Flow step
  -> Playwright locator
  -> bounding box
  -> browser-to-screen coordinate conversion
  -> real pointer move and click
  -> semantic state assertion
```

Calling `locator.click()` is suitable for setup and rehearsal. It is unsuitable for a recorded visible click because it can leave the physical cursor elsewhere.

## Dedicated browser

Launch a clean Chrome profile with remote debugging and fixed dimensions:

```bash
open -na "Google Chrome" --args \
  --remote-debugging-port=9222 \
  --user-data-dir="$TMPDIR/openscreen-demo-chrome" \
  --new-window \
  --window-size=1280,800 \
  --disable-features=PasswordManagerOnboarding,PasswordLeakDetection \
  --disable-save-password-bubble \
  "https://example.test"
```

Use a profile reserved for recordings. Set browser preferences in that profile when command-line flags do not suppress a prompt.

Assign a unique page title before OpenScreen source enumeration:

```js
await page.evaluate(() => {
  document.title = 'Product Flow - unique recording title';
});
```

## Coordinate conversion

Playwright bounding boxes use CSS pixels relative to the page viewport. macOS pointer events use logical screen points. For a normal Chrome window, calculate the center as follows:

```js
const box = await locator.boundingBox();
if (!box) throw new Error('Target is not visible');

const metrics = await page.evaluate(() => ({
  screenX: window.screenX,
  screenY: window.screenY,
  chromeX: (window.outerWidth - window.innerWidth) / 2,
  chromeY: window.outerHeight - window.innerHeight,
}));

const x = Math.round(metrics.screenX + metrics.chromeX + box.x + box.width / 2);
const y = Math.round(metrics.screenY + metrics.chromeY + box.y + box.height / 2);
```

Pass `x` and `y` to `real-pointer`. Do not derive pointer coordinates from a Retina screenshot. Screenshot pixels and macOS logical points can use different scales.

## Field input

Use real pointer clicks to focus fields. Insert non-sensitive demo text with native keystrokes when the typing should appear in the recording. Use Playwright `fill()` for secrets so scripts do not type them visibly, then trim or crop the login portion if the account identifier is sensitive.

## Waits

Each action needs an observable postcondition:

```js
await page.getByRole('button', { name: 'Start shift' }).waitFor();
// real pointer click
await page.getByText('Shift opened').waitFor({ timeout: 30_000 });
```

Prefer roles, labels, and exact visible names. Use test IDs only when the human-facing label is ambiguous.

## Mutation discipline

Before a mutating action, record the expected state and idempotency behavior in the flow. After a timeout, read the resource state before retrying. A missing UI confirmation is not proof that the server rejected the mutation.

## Checkpoints

Capture a checkpoint at:

- the ready state before OpenScreen starts;
- each page or drawer transition during rehearsal;
- an unexpected state during recording;
- the final state after recording.

The final recording should not depend on screenshot analysis between every action. The rehearsal should have removed that uncertainty.
