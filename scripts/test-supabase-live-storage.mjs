import dns from "node:dns/promises";
import { createClient } from "@supabase/supabase-js";
import { ASSIGNMENTS_BUCKET } from "../lib/storage.ts";

async function runLiveTest() {
  console.log("=== SUPABASE LIVE STORAGE INTEGRATION TEST ===\n");

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucketName = ASSIGNMENTS_BUCKET;

  console.log(`Target Bucket: "${bucketName}"`);

  // Step 1: Configuration presence check
  if (!supabaseUrl || !serviceRoleKey) {
    console.log("✗ Configuration missing: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env.");
    console.log("\n==================================================");
    console.log("FINAL STATUS: NOT YET VERIFIED (Missing credentials)");
    console.log("==================================================");
    return;
  }

  // Step 2: URL parsing
  let hostname;
  try {
    const parsed = new URL(supabaseUrl);
    hostname = parsed.hostname;
    console.log(`✓ URL format valid. Hostname: ${hostname.slice(0, 4)}***${hostname.slice(-12)}`);
  } catch (err) {
    console.log(`✗ URL parsing failed: ${err.message}`);
    console.log("\n==================================================");
    console.log("FINAL STATUS: NOT YET VERIFIED (Invalid SUPABASE_URL)");
    console.log("==================================================");
    return;
  }

  // Step 3: DNS Resolution check
  console.log(`Checking DNS resolution for host...`);
  try {
    const lookup = await dns.lookup(hostname);
    console.log(`✓ DNS resolution succeeded: IP Family ${lookup.family}`);
  } catch (dnsErr) {
    console.log(`✗ DNS lookup failed: ${dnsErr.code || dnsErr.message} (${dnsErr.syscall || "lookup"})`);
    console.log(`  Diagnosis: The hostname for this Supabase project does not exist on public DNS.`);
    console.log(`  Cause: The project may be paused, deleted, or using an invalid/placeholder reference.`);
    console.log("\n==================================================");
    console.log("FINAL STATUS: NOT YET VERIFIED (DNS ENOTFOUND)");
    console.log("==================================================");
    return;
  }

  // Step 4: Live Supabase Connection & Bucket Probe
  console.log(`Attempting live connection to Supabase Storage...`);
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const probePath = `tests/probe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.txt`;
  const probeContent = Buffer.from(`GHS Assignment Storage Probe at ${new Date().toISOString()}`);

  try {
    // Probe upload
    const { error: uploadError } = await client.storage
      .from(bucketName)
      .upload(probePath, probeContent, {
        contentType: "text/plain",
        upsert: false,
      });

    if (uploadError) {
      console.log(`✗ Live upload failed: ${uploadError.message}`);
      if (uploadError.message.includes("Bucket not found") || uploadError.message.includes("not found")) {
        console.log(`  Diagnosis: Bucket "${bucketName}" does not exist in the Supabase project.`);
      }
      console.log("\n==================================================");
      console.log("FINAL STATUS: NOT YET VERIFIED (Storage API error)");
      console.log("==================================================");
      return;
    }
    console.log(`✓ Test file successfully uploaded: ${probePath}`);

    // Probe signed URL
    const { data: signedData, error: signedError } = await client.storage
      .from(bucketName)
      .createSignedUrl(probePath, 900);

    if (signedError || !signedData?.signedUrl) {
      console.log(`✗ Signed URL generation failed: ${signedError?.message}`);
      await client.storage.from(bucketName).remove([probePath]);
      console.log("\n==================================================");
      console.log("FINAL STATUS: NOT YET VERIFIED (Signed URL failed)");
      console.log("==================================================");
      return;
    }
    console.log(`✓ Signed URL generated successfully (expires in 900s).`);

    // Probe download via signed URL
    const resDownload = await fetch(signedData.signedUrl);
    if (!resDownload.ok) {
      console.log(`✗ Download via signed URL failed: HTTP ${resDownload.status}`);
      await client.storage.from(bucketName).remove([probePath]);
      console.log("\n==================================================");
      console.log("FINAL STATUS: NOT YET VERIFIED (Download failed)");
      console.log("==================================================");
      return;
    }

    const downloadedText = await resDownload.text();
    if (downloadedText !== probeContent.toString()) {
      console.log(`✗ Downloaded content mismatch.`);
      await client.storage.from(bucketName).remove([probePath]);
      console.log("\n==================================================");
      console.log("FINAL STATUS: NOT YET VERIFIED (Content mismatch)");
      console.log("==================================================");
      return;
    }
    console.log(`✓ File download and content verified successfully.`);

    // Probe cleanup
    const { error: deleteError } = await client.storage
      .from(bucketName)
      .remove([probePath]);

    if (deleteError) {
      console.warn(`! Warning: Cleanup of probe file failed: ${deleteError.message}`);
    } else {
      console.log(`✓ Test probe file cleaned up successfully.`);
    }

    console.log("\n==================================================");
    console.log("FINAL STATUS: LIVE VERIFIED");
    console.log("==================================================");
  } catch (connErr) {
    console.log(`✗ Unexpected error during live connection probe: ${connErr.message}`);
    console.log("\n==================================================");
    console.log("FINAL STATUS: NOT YET VERIFIED (Connection exception)");
    console.log("==================================================");
  }
}

runLiveTest().catch((err) => {
  console.error("Fatal test runner error:", err.message);
  process.exit(1);
});
