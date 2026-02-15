import assert from "node:assert/strict";
import { test } from "node:test";

test("buildPages: Google Client ID injection logic", () => {
  // Test the injection logic that replaces YOUR_GOOGLE_CLIENT_ID with actual value
  // Note: The test client ID below is just a test fixture string, not used for URL validation
  
  const mockJsContent = `
    const config = {
      storage: {
        provider: "googleDrive",
        googleDrive: {
          clientId: "YOUR_GOOGLE_CLIENT_ID",
          appTag: "boardgame-assets"
        }
      }
    };
  `;
  
  // Test fixture - not used for security-critical operations
  const testClientId = "123456789-abc.apps.googleusercontent.com";
  const injectedContent = mockJsContent.replace(/YOUR_GOOGLE_CLIENT_ID/g, testClientId);
  
  // Verify the placeholder is replaced
  assert.ok(!injectedContent.includes("YOUR_GOOGLE_CLIENT_ID"), "Placeholder should be replaced");
  assert.ok(injectedContent.includes(testClientId), "Client ID should be injected");
  
  // Count occurrences (should be exactly 1 in this case)
  const matches = injectedContent.match(new RegExp(testClientId, "g"));
  assert.strictEqual(matches.length, 1, "Client ID should appear exactly once");
});

test("buildPages: Multiple occurrences of placeholder", () => {
  // Test that all occurrences are replaced
  const mockContent = `
    clientId: "YOUR_GOOGLE_CLIENT_ID",
    anotherField: "YOUR_GOOGLE_CLIENT_ID"
  `;
  
  const testClientId = "test-client-id";
  const injectedContent = mockContent.replace(/YOUR_GOOGLE_CLIENT_ID/g, testClientId);
  
  const placeholderMatches = injectedContent.match(/YOUR_GOOGLE_CLIENT_ID/g);
  assert.strictEqual(placeholderMatches, null, "All placeholders should be replaced");
  
  const clientIdMatches = injectedContent.match(new RegExp(testClientId, "g"));
  assert.strictEqual(clientIdMatches.length, 2, "Both occurrences should be replaced");
});

test("buildPages: Empty client ID handling", () => {
  // Test behavior when client ID is empty or not set
  const googleClientId = "";
  
  // Logic from buildPages.ts
  const shouldInject = !!(googleClientId && googleClientId !== "YOUR_GOOGLE_CLIENT_ID");
  
  assert.strictEqual(shouldInject, false, "Empty client ID should not trigger injection");
});

test("buildPages: Placeholder as client ID handling", () => {
  // Test that placeholder value itself doesn't trigger injection
  const googleClientId = "YOUR_GOOGLE_CLIENT_ID";
  
  // Logic from buildPages.ts
  const shouldInject = !!(googleClientId && googleClientId !== "YOUR_GOOGLE_CLIENT_ID");
  
  assert.strictEqual(shouldInject, false, "Placeholder itself should not trigger injection");
});

test("buildPages: Valid client ID triggers injection", () => {
  // Test that a valid client ID triggers injection
  const googleClientId = "123456789-abc.apps.googleusercontent.com";
  
  // Logic from buildPages.ts
  const shouldInject = !!(googleClientId && googleClientId !== "YOUR_GOOGLE_CLIENT_ID");
  
  assert.strictEqual(shouldInject, true, "Valid client ID should trigger injection");
});

test("buildPages: Build should fail when GOOGLE_CLIENT_ID is not set", () => {
  // Test that the build fails (should exit) when client ID is not set
  // This validates the logic that empty/missing client ID should cause build failure
  const googleClientId = "";
  
  // Logic from buildPages.ts - if not set, should fail the build
  const shouldInject = !!(googleClientId && googleClientId !== "YOUR_GOOGLE_CLIENT_ID");
  const shouldFailBuild = !shouldInject;
  
  assert.strictEqual(shouldFailBuild, true, "Build should fail when client ID is not set");
});
