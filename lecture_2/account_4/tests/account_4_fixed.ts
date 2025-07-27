import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Account4 } from "../target/types/account_4";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("Homework", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Account4 as Program<Account4>;
  const provider = anchor.getProvider();

  // Helper function to display program logs
  const showProgramLogs = async (txSig: string, description: string) => {
    console.log(`\n--- Program Logs for ${description} ---`);
    try {
      const tx = await provider.connection.getTransaction(txSig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });

      if (tx && tx.meta && tx.meta.logMessages) {
        tx.meta.logMessages.forEach(log => {
          if (log.includes("Program log:")) {
            console.log("📝", log.replace("Program log: ", ""));
          }
        });
      } else {
        console.log("⚠️  No logs found for this transaction");
      }
    } catch (error) {
      console.log("❌ Error retrieving logs:", error);
    }
    console.log("--- End Program Logs ---\n");
  };

  const collectionOwner = Keypair.generate();
  const vaultUser = Keypair.generate();

  const collectionId = new anchor.BN(1);
  const collectionName = "pudgy_penguins";

  const vaultName = collectionName;

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(collectionOwner.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(vaultUser.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
    );
  });

  const getCollectionAuthorityPda = (collectionId: anchor.BN, collectionName: string) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("authority"), collectionId.toArrayLike(Buffer, "le", 8), Buffer.from(collectionName)],
      program.programId
    );
  };

  const getUserVaultPda = (user: PublicKey, vaultName: string) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("user_vault"), user.toBuffer(), Buffer.from(vaultName)],
      program.programId
    );
  };

  const getVaultAuthorityPda = (user: PublicKey, vaultName: string) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("authority"), user.toBuffer(), Buffer.from(vaultName)],
      program.programId
    );
  };

  it("can initialize a collection authority", async () => {
    const [collectionAuthorityPda] = getCollectionAuthorityPda(collectionId, collectionName);

    const tx = await program.methods.initializeCollectionAuthority(
      collectionId,
      collectionName,
      collectionOwner.publicKey,
    ).accounts({
      collectionAuthority: collectionAuthorityPda,
      payer: collectionOwner.publicKey,
    }).signers([collectionOwner]).rpc();

    await showProgramLogs(tx, "initialize collection authority");

    const collectionAuthority = await program.account.collectionAuthority.fetch(
      collectionAuthorityPda
    );

    assert.equal(collectionAuthority.collectionId.toNumber(), collectionId.toNumber());
    assert.equal(collectionAuthority.collectionName, collectionName);
    assert.equal(collectionAuthority.canMint.toNumber(), 1);
  });

  it("can toggle collection minting", async () => {
    const [collectionAuthorityPda] = getCollectionAuthorityPda(collectionId, collectionName);

    const tx = await program.methods.toggleCollectionMinting().accounts({
      collectionAuthority: collectionAuthorityPda,
      authority: collectionOwner.publicKey,
    }).signers([collectionOwner]).rpc();

    await showProgramLogs(tx, "toggle collection minting");

    const collectionAuthority = await program.account.collectionAuthority.fetch(
      collectionAuthorityPda
    );

    assert.equal(collectionAuthority.canMint.toNumber(), 0);

    const tx2 = await program.methods.toggleCollectionMinting().accounts({
      collectionAuthority: collectionAuthorityPda,
      authority: collectionOwner.publicKey,
    }).signers([collectionOwner]).rpc();

    await showProgramLogs(tx2, "toggle collection minting");

    const collectionAuthority2 = await program.account.collectionAuthority.fetch(
      collectionAuthorityPda
    );

    assert.equal(collectionAuthority2.canMint.toNumber(), 1);
  });

  it("can initialize a user vault", async () => {
    const [userVaultPda] = getUserVaultPda(vaultUser.publicKey, vaultName);

    const tx = await program.methods.initializeUserVault(vaultUser.publicKey, vaultName).accounts({
      userVault: userVaultPda,
      payer: collectionOwner.publicKey, // anyone can pay for the user vault
    }).signers([collectionOwner]).rpc();

    await showProgramLogs(tx, "initialize user vault");

    const userVault = await program.account.userVault.fetch(
      userVaultPda
    );

    assert.equal(userVault.vaultName, vaultName);
    assert.equal(userVault.balance.toNumber(), 0);
  });

  it("can mint an NFT", async () => {
    const [collectionAuthorityPda] = getCollectionAuthorityPda(collectionId, collectionName);
    const [userVaultPda] = getUserVaultPda(vaultUser.publicKey, vaultName);

    const tx = await program.methods.mintNft(vaultUser.publicKey, collectionId, collectionName).accounts({
      collectionAuthority: collectionAuthorityPda,
      userVault: userVaultPda,
      payer: collectionOwner.publicKey,
    }).signers([collectionOwner]).rpc();

    await showProgramLogs(tx, "mint NFT");

    const userVault = await program.account.userVault.fetch(
      userVaultPda
    );

    assert.equal(userVault.balance.toNumber(), 1);
  });

  it("cannot mint an NFT if the user vault belongs to a different collection", async () => {
    const [userVaultPda] = getUserVaultPda(vaultUser.publicKey, "different_collection");
    const [collectionAuthorityPda] = getCollectionAuthorityPda(collectionId, collectionName);

    const tx = await program.methods.initializeUserVault(vaultUser.publicKey, "different_collection").accounts({
      userVault: userVaultPda,
      payer: collectionOwner.publicKey,
    }).signers([collectionOwner]).rpc();
    await showProgramLogs(tx, "initialize user vault");

    try {
      const tx2 = await program.methods.mintNft(vaultUser.publicKey, collectionId, collectionName).accounts({
        collectionAuthority: collectionAuthorityPda,
        userVault: userVaultPda,
        payer: collectionOwner.publicKey,
      }).signers([collectionOwner]).rpc();

      await showProgramLogs(tx2, "mint NFT");
    } catch (error) {
      assert.equal(error.toString().includes("ConstraintSeeds"), true);
    }
  });

  it("cannot mint an NFT if the collection is not mintable", async () => {
    const [collectionAuthorityPda] = getCollectionAuthorityPda(collectionId, collectionName);

    const tx = await program.methods.toggleCollectionMinting().accounts({
      collectionAuthority: collectionAuthorityPda,
      authority: collectionOwner.publicKey,
    }).signers([collectionOwner]).rpc();

    await showProgramLogs(tx, "toggle collection minting");

    const [userVaultPda] = getUserVaultPda(vaultUser.publicKey, vaultName);

    try {
      const tx2 = await program.methods.mintNft(vaultUser.publicKey, collectionId, collectionName).accounts({
        collectionAuthority: collectionAuthorityPda,
        userVault: userVaultPda,
        payer: collectionOwner.publicKey,
      }).signers([collectionOwner]).rpc();

      await showProgramLogs(tx2, "mint NFT");
    } catch (error) {
      assert.equal(error.toString().includes("NotMintable"), true);
    }
  });

  it("can deposit to a user vault", async () => {
    const [userVaultPda] = getUserVaultPda(vaultUser.publicKey, vaultName);
    const [vaultAuthorityPda] = getVaultAuthorityPda(vaultUser.publicKey, vaultName);

    const tx = await program.methods.depositToVault(vaultName, new anchor.BN(1)).accounts({
      userVault: userVaultPda,
      vaultAuthority: vaultAuthorityPda,
      user: vaultUser.publicKey,
    }).signers([vaultUser]).rpc();

    await showProgramLogs(tx, "deposit to user vault");

    const userVault = await program.account.userVault.fetch(
      userVaultPda
    );

    assert.equal(userVault.balance.toNumber(), 0);

    const vaultAuthority = await program.account.userVault.fetch(
      vaultAuthorityPda
    );

    assert.equal(vaultAuthority.balance.toNumber(), 1);
  });

  it("cannot deposit to a user vault if the user is not the vault user", async () => {
    const [userVaultPda] = getUserVaultPda(vaultUser.publicKey, vaultName);
    const [vaultAuthorityPda] = getVaultAuthorityPda(vaultUser.publicKey, vaultName);

    try {
      const tx = await program.methods.depositToVault(vaultName, new anchor.BN(1)).accounts({
        userVault: userVaultPda,
        vaultAuthority: vaultAuthorityPda,
        user: collectionOwner.publicKey,
      }).signers([collectionOwner]).rpc();

      await showProgramLogs(tx, "deposit to user vault");
    } catch (error) {
      assert.equal(error.toString().includes("ConstraintSeeds"), true);
    }
  });

  it("cannot deposit to a user vault if the amount is greater than the user's balance", async () => {
    const [userVaultPda] = getUserVaultPda(vaultUser.publicKey, vaultName);
    const [vaultAuthorityPda] = getVaultAuthorityPda(vaultUser.publicKey, vaultName);

    try {
      const tx = await program.methods.depositToVault(vaultName, new anchor.BN(1)).accounts({
        userVault: userVaultPda,
        vaultAuthority: vaultAuthorityPda,
        user: vaultUser.publicKey,
      }).signers([vaultUser]).rpc();

      await showProgramLogs(tx, "deposit to user vault");
    } catch (error) {
      assert.equal(error.toString().includes("InsufficientBalance"), true);
    }
  });

  it("can withdraw from a user vault", async () => {
    const [userVaultPda] = getUserVaultPda(vaultUser.publicKey, vaultName);
    const [vaultAuthorityPda] = getVaultAuthorityPda(vaultUser.publicKey, vaultName);

    const tx = await program.methods.withdrawFromVault(vaultName, new anchor.BN(1)).accounts({
      userVault: userVaultPda,
      vaultAuthority: vaultAuthorityPda,
      user: vaultUser.publicKey,
    }).signers([vaultUser]).rpc();

    await showProgramLogs(tx, "withdraw from user vault");

    const userVault = await program.account.userVault.fetch(
      userVaultPda
    );

    assert.equal(userVault.balance.toNumber(), 1);

    const vaultAuthority = await program.account.userVault.fetch(
      vaultAuthorityPda
    );

    assert.equal(vaultAuthority.balance.toNumber(), 0);
  });

  it("cannot withdraw from a user vault if the user is not the vault user", async () => {
    const [userVaultPda] = getUserVaultPda(vaultUser.publicKey, vaultName);
    const [vaultAuthorityPda] = getVaultAuthorityPda(vaultUser.publicKey, vaultName);

    try {
      const tx = await program.methods.withdrawFromVault(vaultName, new anchor.BN(1)).accounts({
        userVault: userVaultPda,
        vaultAuthority: vaultAuthorityPda,
        user: collectionOwner.publicKey,
      }).signers([collectionOwner]).rpc();

      await showProgramLogs(tx, "withdraw from user vault");
    } catch (error) {
      assert.equal(error.toString().includes("ConstraintSeeds"), true);
    }
  });

  it("cannot withdraw from a user vault if the amount is greater than the vault authority's balance", async () => {
    const [userVaultPda] = getUserVaultPda(vaultUser.publicKey, vaultName);
    const [vaultAuthorityPda] = getVaultAuthorityPda(vaultUser.publicKey, vaultName);

    try {
      const tx = await program.methods.withdrawFromVault(vaultName, new anchor.BN(1)).accounts({
        userVault: userVaultPda,
        vaultAuthority: vaultAuthorityPda,
        user: vaultUser.publicKey,
      }).signers([vaultUser]).rpc();

      await showProgramLogs(tx, "withdraw from user vault");
    } catch (error) {
      assert.equal(error.toString().includes("InsufficientBalance"), true);
    }
  });
});
